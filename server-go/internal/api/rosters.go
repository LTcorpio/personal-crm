package api

// ==========================================
// 名单管理：Excel 解析预览、导入、查询、筛选、重命名、排序、删除
// （对应 controllers/rosterController.js 与 routes/rosterRoutes.js 的 multer 配置）
// ==========================================

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"crm-server/internal/excel"
	"crm-server/internal/web"
)

// rosterUploadLimit 单文件大小限制（对齐 multer limits.fileSize: 20MB）。
const rosterUploadLimit = 20 << 20

// ==========================================
// 1. 解析上传的 Excel 文件（不落库，返回所有工作表的预览数据供用户确认）
// ==========================================

func (s *Server) handleParseRoster(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "请选择要上传的 Excel 文件"})
		return
	}
	defer file.Close()

	// 对齐 multer fileFilter：仅允许 .xls / .xlsx
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".xls" && ext != ".xlsx" {
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "仅支持 .xls 和 .xlsx 格式的 Excel 文件"})
		return
	}
	// 对齐 multer limits.fileSize
	if header.Size > rosterUploadLimit {
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "文件大小超过 20MB 限制"})
		return
	}

	// 对齐 multer diskStorage：临时存储到系统临时目录，加时间戳前缀避免重名
	uploadDir := filepath.Join(os.TempDir(), "crm-roster-uploads")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		logServerError("[名单解析] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "Excel 文件解析失败: " + err.Error()})
		return
	}
	tmpPath := filepath.Join(uploadDir, fmt.Sprintf("%d-%s", time.Now().UnixMilli(), header.Filename))

	dst, err := os.Create(tmpPath)
	if err != nil {
		logServerError("[名单解析] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "Excel 文件解析失败: " + err.Error()})
		return
	}
	if _, err := io.Copy(dst, file); err != nil {
		dst.Close()
		os.Remove(tmpPath)
		logServerError("[名单解析] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "Excel 文件解析失败: " + err.Error()})
		return
	}
	dst.Close()
	// 与 Node 版一致：解析完成后清理临时文件
	defer os.Remove(tmpPath)

	sheets, err := excel.Parse(tmpPath, ext)
	if err != nil {
		logServerError("[名单解析] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "Excel 文件解析失败: " + err.Error()})
		return
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": map[string]any{"sheets": sheets}})
}

// ==========================================
// 2. 确认导入：将用户确认后的数据持久化到 SQLite
// ==========================================

func (s *Server) handleSaveRoster(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name              string           `json:"name"`
		Columns           []string         `json:"columns"`
		Rows              []map[string]any `json:"rows"`
		FilterableColumns []string         `json:"filterableColumns"`
	}
	if err := decodeJSONBody(r, &body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	if body.Name == "" || body.Columns == nil || body.Rows == nil {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "参数不完整"})
		return
	}

	writeErr := func(err error) {
		logServerError("[名单保存] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "保存失败: " + err.Error()})
	}

	tx, err := s.roster.Begin()
	if err != nil {
		writeErr(err)
		return
	}
	rollback := func() { _ = tx.Rollback() }

	// 1. 计算新名单的 sort_order（放在最后）
	var maxOrder sql.NullInt64
	if err := tx.QueryRow(`SELECT MAX(sort_order) AS max_order FROM rosters`).Scan(&maxOrder); err != nil {
		rollback()
		writeErr(err)
		return
	}
	nextOrder := int64(0)
	if maxOrder.Valid {
		nextOrder = maxOrder.Int64 + 1
	}

	// 可筛选字段：未指定时默认全部字段可筛选
	var filterable []string
	if body.FilterableColumns != nil {
		columnsSet := make(map[string]bool, len(body.Columns))
		for _, c := range body.Columns {
			columnsSet[c] = true
		}
		filterable = make([]string, 0, len(body.FilterableColumns))
		for _, c := range body.FilterableColumns {
			if columnsSet[c] {
				filterable = append(filterable, c)
			}
		}
	} else {
		filterable = append([]string{}, body.Columns...)
	}

	columnsJSON, _ := json.Marshal(body.Columns)
	filterableJSON, _ := json.Marshal(filterable)

	// 2. 插入名单元数据（不再保存原始文件名，避免乱码问题）
	res, err := tx.Exec(
		`INSERT INTO rosters (name, original_filename, columns, row_count, sort_order, filterable_columns) VALUES (?, ?, ?, ?, ?, ?)`,
		body.Name, "", string(columnsJSON), len(body.Rows), nextOrder, string(filterableJSON),
	)
	if err != nil {
		rollback()
		writeErr(err)
		return
	}
	rosterID, err := res.LastInsertId()
	if err != nil {
		rollback()
		writeErr(err)
		return
	}

	// 3. 逐行插入数据：以数组形式存储（按 columns 顺序），避免每行重复字段名
	for i, row := range body.Rows {
		arr := make([]string, len(body.Columns))
		for c, col := range body.Columns {
			if v, ok := row[col]; ok {
				arr[c] = web.JSString(v)
			} else {
				arr[c] = ""
			}
		}
		dataJSON, _ := json.Marshal(arr)
		if _, err := tx.Exec(
			`INSERT INTO roster_rows (roster_id, row_index, data) VALUES (?, ?, ?)`,
			rosterID, i, string(dataJSON),
		); err != nil {
			rollback()
			writeErr(err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		rollback()
		writeErr(err)
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": map[string]any{"id": rosterID, "rowCount": len(body.Rows)}})
}

// ==========================================
// 3. 获取所有名单元数据列表（不含行数据）
// ==========================================

func (s *Server) handleGetRosters(w http.ResponseWriter, r *http.Request) {
	rows, err := s.roster.Query(
		`SELECT id, name, original_filename, columns, filterable_columns, row_count, sort_order, uploaded_at FROM rosters ORDER BY sort_order ASC, id ASC`,
	)
	if err != nil {
		logServerError("[名单列表] 查询失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	defer rows.Close()

	list := make([]rosterMetaJSON, 0)
	for rows.Next() {
		item, err := scanRosterMeta(rows)
		if err != nil {
			logServerError("[名单列表] 查询失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
			return
		}
		list = append(list, *item)
	}
	if err := rows.Err(); err != nil {
		logServerError("[名单列表] 查询失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": list})
}

// ==========================================
// 3.1 重命名名单
// ==========================================

func (s *Server) handleRenameRoster(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name *string `json:"name"`
	}
	if err := decodeJSONBody(r, &body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	name := ""
	if body.Name != nil {
		name = strings.TrimSpace(*body.Name)
	}
	if name == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "名单名称不能为空"})
		return
	}

	if _, err := s.roster.Exec(`UPDATE rosters SET name = ? WHERE id = ?`, name, r.PathValue("id")); err != nil {
		logServerError("[名单重命名] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "重命名失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "重命名成功"})
}

// ==========================================
// 3.2 调整名单显示顺序
// ==========================================

func (s *Server) handleUpdateRostersOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RosterIDs []any `json:"rosterIds"`
	}
	if err := decodeJSONBody(r, &body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.RosterIDs == nil || len(body.RosterIDs) == 0 {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "参数不完整"})
		return
	}

	tx, err := s.roster.Begin()
	if err != nil {
		logServerError("[名单排序] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "排序失败"})
		return
	}
	rollback := func() { _ = tx.Rollback() }

	for i, id := range body.RosterIDs {
		if _, err := tx.Exec(`UPDATE rosters SET sort_order = ? WHERE id = ?`, i, jsSQLValue(id)); err != nil {
			rollback()
			logServerError("[名单排序] 失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "排序失败"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("[名单排序] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "排序失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "顺序已更新"})
}

// ==========================================
// 4. 获取单份名单的完整数据
// ==========================================

func (s *Server) handleGetRosterByID(w http.ResponseWriter, r *http.Request) {
	item, err := s.queryRosterMeta(`SELECT id, name, original_filename, columns, filterable_columns, row_count, sort_order, uploaded_at FROM rosters WHERE id = ?`, r.PathValue("id"))
	if err != nil {
		logServerError("[名单详情] 查询失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	if item == nil {
		web.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "名单不存在"})
		return
	}

	rows, err := s.roster.Query(`SELECT row_index, data FROM roster_rows WHERE roster_id = ? ORDER BY row_index ASC`, item.ID)
	if err != nil {
		logServerError("[名单详情] 查询失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	defer rows.Close()

	rowList := make([]map[string]any, 0)
	for rows.Next() {
		var dataStr string
		if err := rows.Scan(&sql.NullInt64{}, &dataStr); err != nil {
			logServerError("[名单详情] 查询失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
			return
		}
		obj, err := parseRowData(dataStr, item.Columns)
		if err != nil {
			logServerError("[名单详情] 查询失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
			return
		}
		rowList = append(rowList, obj)
	}
	if err := rows.Err(); err != nil {
		logServerError("[名单详情] 查询失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data": map[string]any{
			"id":                 item.ID,
			"name":               item.Name,
			"original_filename":  item.OriginalFilename,
			"columns":            item.Columns,
			"filterable_columns": item.FilterableColumns,
			"row_count":          item.RowCount,
			"uploaded_at":        item.UploadedAt,
			"rows":               rowList,
		},
	})
}

// ==========================================
// 5. 删除一份名单
// ==========================================

func (s *Server) handleDeleteRoster(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.roster.Exec(`DELETE FROM roster_rows WHERE roster_id = ?`, id); err != nil {
		logServerError("[名单删除] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "删除失败"})
		return
	}
	if _, err := s.roster.Exec(`DELETE FROM rosters WHERE id = ?`, id); err != nil {
		logServerError("[名单删除] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "删除失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "名单已删除"})
}

// ==========================================
// 6. 搜索 / 筛选：仅支持指定单份名单
// ==========================================

func (s *Server) handleSearchRosters(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	keyword, rosterID, filtersParam := q.Get("keyword"), q.Get("rosterId"), q.Get("filters")

	var filterObj map[string]any
	if filtersParam != "" {
		var parsed any
		if err := json.Unmarshal([]byte(filtersParam), &parsed); err != nil {
			// Node 版此处 JSON.parse 抛错未捕获，最终以 500 返回
			logServerError("[名单搜索] 失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "搜索失败"})
			return
		}
		filterObj, _ = parsed.(map[string]any)
	}

	emptyData := func() {
		web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": []any{}})
	}
	if rosterID == "" {
		emptyData()
		return
	}

	item, err := s.queryRosterMeta(`SELECT id, name, original_filename, columns, filterable_columns, row_count, sort_order, uploaded_at FROM rosters WHERE id = ?`, rosterID)
	if err != nil {
		logServerError("[名单搜索] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "搜索失败"})
		return
	}
	if item == nil {
		emptyData()
		return
	}

	rows, err := s.roster.Query(`SELECT row_index, data FROM roster_rows WHERE roster_id = ? ORDER BY row_index ASC`, item.ID)
	if err != nil {
		logServerError("[名单搜索] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "搜索失败"})
		return
	}
	rowList := make([]map[string]any, 0)
	for rows.Next() {
		var dataStr string
		if err := rows.Scan(&sql.NullInt64{}, &dataStr); err != nil {
			rows.Close()
			logServerError("[名单搜索] 失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "搜索失败"})
			return
		}
		obj, err := parseRowData(dataStr, item.Columns)
		if err != nil {
			rows.Close()
			logServerError("[名单搜索] 失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "搜索失败"})
			return
		}
		rowList = append(rowList, obj)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		logServerError("[名单搜索] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "搜索失败"})
		return
	}

	// 关键字模糊匹配：遍历所有字段值
	if strings.TrimSpace(keyword) != "" {
		kw := strings.ToLower(strings.TrimSpace(keyword))
		filtered := make([]map[string]any, 0, len(rowList))
		for _, row := range rowList {
			matched := false
			for _, val := range row {
				if strings.Contains(strings.ToLower(web.JSString(val)), kw) {
					matched = true
					break
				}
			}
			if matched {
				filtered = append(filtered, row)
			}
		}
		rowList = filtered
	}

	// 字段筛选：列内 OR（包含任意片段），列间 AND
	type activeFilter struct {
		col  string
		vals any
	}
	var activeFilters []activeFilter
	for col, vals := range filterObj {
		if !web.Truthy(vals) {
			continue
		}
		if arr, ok := vals.([]any); ok && len(arr) == 0 {
			continue
		}
		activeFilters = append(activeFilters, activeFilter{col, vals})
	}

	if len(activeFilters) > 0 {
		filtered := make([]map[string]any, 0, len(rowList))
		for _, row := range rowList {
			allMatch := true
			for _, f := range activeFilters {
				cellVal := strings.ToLower(cellStringOrEmpty(row[f.col]))
				var arr []any
				if a, ok := f.vals.([]any); ok {
					arr = a
				} else {
					arr = []any{f.vals}
				}
				anyHit := false
				for _, v := range arr {
					if strings.Contains(cellVal, strings.ToLower(web.JSString(v))) {
						anyHit = true
						break
					}
				}
				if !anyHit {
					allMatch = false
					break
				}
			}
			if allMatch {
				filtered = append(filtered, row)
			}
		}
		rowList = filtered
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data": []any{map[string]any{
			"id":                 item.ID,
			"name":               item.Name,
			"columns":            item.Columns,
			"filterable_columns": item.FilterableColumns,
			"rows":               rowList,
			"matchedCount":       len(rowList),
		}},
	})
}

// ==========================================
// 7. 获取指定名单中某列的所有不重复值（用于筛选下拉选项）
// ==========================================

func (s *Server) handleGetColumnValues(w http.ResponseWriter, r *http.Request) {
	column := r.URL.Query().Get("column")
	if column == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "请指定列名"})
		return
	}
	id := r.PathValue("id")

	// 先取名单的 columns 以确定列索引（数组存储格式下按位置取值）
	var columnsRaw string
	err := s.roster.QueryRow(`SELECT columns FROM rosters WHERE id = ?`, id).Scan(&columnsRaw)
	if errors.Is(err, sql.ErrNoRows) {
		web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": []string{}})
		return
	}
	if err != nil {
		logServerError("[列值查询] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	var columns []string
	if err := json.Unmarshal([]byte(columnsRaw), &columns); err != nil {
		logServerError("[列值查询] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	colIdx := -1
	for i, c := range columns {
		if c == column {
			colIdx = i
			break
		}
	}

	rows, err := s.roster.Query(`SELECT data FROM roster_rows WHERE roster_id = ?`, id)
	if err != nil {
		logServerError("[列值查询] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}
	defer rows.Close()

	seen := make(map[string]bool)
	values := make([]string, 0)
	addValue := func(v any) {
		// 对齐 `val !== undefined && val !== ''`：仅空字符串被排除，null/0/false 均计入
		if s, ok := v.(string); ok && s == "" {
			return
		}
		str := web.JSString(v)
		if !seen[str] {
			seen[str] = true
			values = append(values, str)
		}
	}
	for rows.Next() {
		var dataStr string
		if err := rows.Scan(&dataStr); err != nil {
			logServerError("[列值查询] 失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
			return
		}
		var parsed any
		if err := json.Unmarshal([]byte(dataStr), &parsed); err != nil {
			continue // 与 Node 版一致：解析失败的行静默跳过
		}
		if arr, ok := parsed.([]any); ok {
			// 新格式：数组，按列索引取值（越界等价 undefined，跳过）
			if colIdx >= 0 && colIdx < len(arr) {
				addValue(arr[colIdx])
			}
			continue
		}
		// 旧格式：对象，按列名取值
		if obj, ok := parsed.(map[string]any); ok {
			if v, exists := obj[column]; exists {
				addValue(v)
			}
		}
	}
	if err := rows.Err(); err != nil {
		logServerError("[列值查询] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "查询失败"})
		return
	}

	sort.Strings(values)
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": values})
}

// ==========================================
// 8. 更新名单的可筛选字段
// ==========================================

func (s *Server) handleUpdateFilterableColumns(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		FilterableColumns []string `json:"filterableColumns"`
	}
	if err := decodeJSONBody(r, &body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	// 先校验名单是否存在，并取出全部字段做白名单过滤
	var columnsRaw string
	err := s.roster.QueryRow(`SELECT columns FROM rosters WHERE id = ?`, id).Scan(&columnsRaw)
	if errors.Is(err, sql.ErrNoRows) {
		web.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "名单不存在"})
		return
	}
	if err != nil {
		logServerError("[可筛选字段更新] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "更新失败"})
		return
	}
	var allColumns []string
	if err := json.Unmarshal([]byte(columnsRaw), &allColumns); err != nil {
		logServerError("[可筛选字段更新] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "更新失败"})
		return
	}

	var toSave []string
	if body.FilterableColumns != nil {
		// 仅保留属于该名单的字段，并保持原始列顺序
		selected := make(map[string]bool, len(body.FilterableColumns))
		for _, c := range body.FilterableColumns {
			selected[c] = true
		}
		toSave = make([]string, 0, len(allColumns))
		for _, c := range allColumns {
			if selected[c] {
				toSave = append(toSave, c)
			}
		}
	} else {
		// 未传或传 null 表示全部可筛选
		toSave = append([]string{}, allColumns...)
	}

	filterableJSON, _ := json.Marshal(toSave)
	if _, err := s.roster.Exec(`UPDATE rosters SET filterable_columns = ? WHERE id = ?`, string(filterableJSON), id); err != nil {
		logServerError("[可筛选字段更新] 失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "更新失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": map[string]any{"filterable_columns": toSave}})
}

// ==========================================
// 数据装载辅助
// ==========================================

// rosterMetaJSON 名单元数据（列表输出）。
type rosterMetaJSON struct {
	ID                int64    `json:"id"`
	Name              string   `json:"name"`
	OriginalFilename  any      `json:"original_filename"`
	Columns           []string `json:"columns"`
	FilterableColumns any      `json:"filterable_columns"`
	RowCount          int64    `json:"row_count"`
	SortOrder         int64    `json:"sort_order"`
	UploadedAt        string   `json:"uploaded_at"`
}

// scanRosterMeta 将一行名单元数据规整为输出结构。
func scanRosterMeta(scanner interface{ Scan(dest ...any) error }) (*rosterMetaJSON, error) {
	var (
		id                int64
		name              string
		originalFilename  sql.NullString
		columnsRaw        string
		filterableColumns sql.NullString
		rowCount          int64
		sortOrder         int64
		uploadedAt        string
	)
	if err := scanner.Scan(&id, &name, &originalFilename, &columnsRaw, &filterableColumns, &rowCount, &sortOrder, &uploadedAt); err != nil {
		return nil, err
	}

	var columns []string
	if err := json.Unmarshal([]byte(columnsRaw), &columns); err != nil {
		return nil, err
	}

	var filterable any
	if filterableColumns.Valid && filterableColumns.String != "" {
		var parsed []string
		if err := json.Unmarshal([]byte(filterableColumns.String), &parsed); err != nil {
			return nil, err
		}
		filterable = parsed
	}

	var originalFilenameAny any
	if originalFilename.Valid {
		originalFilenameAny = originalFilename.String
	}

	return &rosterMetaJSON{
		ID:                id,
		Name:              name,
		OriginalFilename:  originalFilenameAny,
		Columns:           columns,
		FilterableColumns: filterable,
		RowCount:          rowCount,
		SortOrder:         sortOrder,
		UploadedAt:        uploadedAt,
	}, nil
}

// queryRosterMeta 按条件查询单条名单元数据，不存在时返回 nil。
func (s *Server) queryRosterMeta(query, id string) (*rosterMetaJSON, error) {
	item, err := scanRosterMeta(s.roster.QueryRow(query, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return item, nil
}

// parseRowData 将存储的 data 字符串解析为对象，兼容数组（新）与对象（旧）两种格式。
func parseRowData(dataStr string, columns []string) (map[string]any, error) {
	var parsed any
	if err := json.Unmarshal([]byte(dataStr), &parsed); err != nil {
		return nil, err
	}
	if arr, ok := parsed.([]any); ok {
		obj := make(map[string]any, len(columns))
		for i, col := range columns {
			if i < len(arr) {
				obj[col] = web.JSString(arr[i])
			} else {
				obj[col] = ""
			}
		}
		return obj, nil
	}
	if obj, ok := parsed.(map[string]any); ok {
		return obj, nil
	}
	return nil, errors.New("无法识别的行数据格式")
}

// cellStringOrEmpty 复刻 `String(row[col] || ”)`。
func cellStringOrEmpty(v any) string {
	if !web.Truthy(v) {
		return ""
	}
	return web.JSString(v)
}

// decodeJSONBody 解析 JSON 请求体：空请求体视作空对象（对齐 express.json）。
func decodeJSONBody(r *http.Request, v any) error {
	err := json.NewDecoder(r.Body).Decode(v)
	if errors.Is(err, io.EOF) {
		return nil // 空请求体 → 保持零值结构体，交由业务校验处理
	}
	return err
}
