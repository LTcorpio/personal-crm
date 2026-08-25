package api

// ==========================================
// 主题分类管理：列表、增删改、成员差异比对、排序
// （对应 contactController.js 的 getTopics/createTopic/updateTopic/
//   deleteTopic/updateTopicsOrder 与 replaceTopicMembers）
// ==========================================

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"

	"crm-server/internal/web"
)

// topicMemberPayload 前端传入的主题成员。
type topicMemberPayload struct {
	ID        any `json:"id"` // 记录物理主键（数字或字符串）
	ContactID any `json:"contactId"`
	Name      any `json:"name"`
	Remark    any `json:"remark"`
}

// topicMemberJSON 成员输出结构（字段名与 Node 版一致）。
type topicMemberJSON struct {
	ID        int64  `json:"id"`
	ContactID string `json:"contactId"`
	Name      string `json:"name"`
	SortOrder any    `json:"sortOrder"`
	Remark    string `json:"remark"`
}

// topicJSON 主题输出结构（{...topic, members} 的键序对齐 Node 版）。
type topicJSON struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Color     any               `json:"color"`
	SortOrder any               `json:"sort_order"`
	CreatedAt any               `json:"created_at"`
	UpdatedAt any               `json:"updated_at"`
	Members   []topicMemberJSON `json:"members"`
}

// ==========================================
// 5. 获取主题列表
// ==========================================

func (s *Server) handleGetTopics(w http.ResponseWriter, r *http.Request) {
	topics, err := s.topicsWithMembers(nil)
	if err != nil {
		logServerError("获取主题失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "获取主题失败"})
		return
	}
	if topics == nil {
		topics = []topicJSON{}
	}
	web.WriteJSON(w, http.StatusOK, topics)
}

// ==========================================
// 6. 新增主题
// ==========================================

func (s *Server) handleCreateTopic(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    json.RawMessage      `json:"name"`
		Color   json.RawMessage      `json:"color"`
		Members []topicMemberPayload `json:"members"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	topicName := strings.TrimSpace(rawStringOrEmpty(body.Name))
	if topicName == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "主题名称不能为空"})
		return
	}
	color, colorValid := topicColor(body.Color)

	writeErr := func() {
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "保存主题失败"})
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("保存主题失败:", err)
		writeErr()
		return
	}
	rollback := func() { _ = tx.Rollback() }

	var colorParam any
	if colorValid {
		colorParam = color
	}
	res, err := tx.Exec(`INSERT INTO contact_topics (name, color) VALUES (?, ?)`, topicName, colorParam)
	if err != nil {
		rollback()
		logServerError("保存主题失败:", err)
		writeErr()
		return
	}
	topicID, err := res.LastInsertId()
	if err != nil {
		rollback()
		logServerError("保存主题失败:", err)
		writeErr()
		return
	}

	if err := replaceTopicMembers(tx, topicID, body.Members); err != nil {
		rollback()
		logServerError("保存主题失败:", err)
		writeErr()
		return
	}
	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("保存主题失败:", err)
		writeErr()
		return
	}

	var idParam any = topicID
	topics, err := s.topicsWithMembers(&idParam)
	if err != nil {
		logServerError("保存主题失败:", err)
		writeErr()
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "topic": topicOrNull(topics)})
}

// ==========================================
// 7. 更新主题
// ==========================================

func (s *Server) handleUpdateTopic(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    json.RawMessage      `json:"name"`
		Color   json.RawMessage      `json:"color"`
		Members []topicMemberPayload `json:"members"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	topicName := strings.TrimSpace(rawStringOrEmpty(body.Name))
	if topicName == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "主题名称不能为空"})
		return
	}
	color, colorValid := topicColor(body.Color)
	id := r.PathValue("id")

	writeErr := func() {
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "更新主题失败"})
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("更新主题失败:", err)
		writeErr()
		return
	}
	rollback := func() { _ = tx.Rollback() }

	// 只有主题自身属性变化时，才调整主题表的 updated_at
	var oldName string
	var oldColor sql.NullString
	err = tx.QueryRow(`SELECT name, color FROM contact_topics WHERE id = ?`, id).Scan(&oldName, &oldColor)
	switch {
	case err == nil:
		colorChanged := oldColor.Valid != colorValid ||
			(colorValid && oldColor.String != color)
		if oldName != topicName || colorChanged {
			var colorParam any
			if colorValid {
				colorParam = color
			}
			if _, err := tx.Exec(`
                UPDATE contact_topics
                SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, topicName, colorParam, id); err != nil {
				rollback()
				logServerError("更新主题失败:", err)
				writeErr()
				return
			}
		}
	case err == sql.ErrNoRows:
		// 主题不存在时跳过主表更新，与 Node 版一致
	default:
		rollback()
		logServerError("更新主题失败:", err)
		writeErr()
		return
	}

	if err := replaceTopicMembers(tx, id, body.Members); err != nil {
		rollback()
		logServerError("更新主题失败:", err)
		writeErr()
		return
	}
	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("更新主题失败:", err)
		writeErr()
		return
	}

	topics, err := s.topicsWithMembers(strPtrToAny(&id))
	if err != nil {
		logServerError("更新主题失败:", err)
		writeErr()
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "topic": topicOrNull(topics)})
}

// ==========================================
// 8. 删除主题
// ==========================================

func (s *Server) handleDeleteTopic(w http.ResponseWriter, r *http.Request) {
	if _, err := s.crm.Exec(`DELETE FROM contact_topics WHERE id = ?`, r.PathValue("id")); err != nil {
		logServerError("删除主题失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "删除主题失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "删除成功"})
}

// ==========================================
// 10. 更新主题排序
// ==========================================

func (s *Server) handleUpdateTopicsOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TopicIDs []any `json:"topicIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.TopicIDs == nil {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "参数错误"})
		return
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("更新主题排序失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "排序更新失败"})
		return
	}
	rollback := func() { _ = tx.Rollback() }

	for index, id := range body.TopicIDs {
		if _, err := tx.Exec(
			`UPDATE contact_topics SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			index, jsSQLValue(id),
		); err != nil {
			rollback()
			logServerError("更新主题排序失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "排序更新失败"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("更新主题排序失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "排序更新失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "排序更新成功"})
}

// ==========================================
// 数据装载与成员差异比对
// ==========================================

// topicsWithMembers 查询主题（可选按 ID 过滤）并附带成员。
func (s *Server) topicsWithMembers(topicID *any) ([]topicJSON, error) {
	query := `SELECT id, name, color, sort_order, created_at, updated_at FROM contact_topics`
	var params []any
	if topicID != nil {
		query += ` WHERE id = ?`
		params = append(params, *topicID)
	}
	query += ` ORDER BY sort_order ASC, created_at DESC, id DESC`

	rows, err := s.crm.Query(query, params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type topicRow struct {
		id        int64
		name      string
		color     sql.NullString
		sortOrder sql.NullInt64
		createdAt sql.NullString
		updatedAt sql.NullString
	}
	var topics []topicRow
	for rows.Next() {
		var t topicRow
		if err := rows.Scan(&t.id, &t.name, &t.color, &t.sortOrder, &t.createdAt, &t.updatedAt); err != nil {
			return nil, err
		}
		topics = append(topics, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]topicJSON, 0, len(topics))
	for _, t := range topics {
		members, err := s.topicMembers(t.id)
		if err != nil {
			return nil, err
		}
		result = append(result, topicJSON{
			ID:        t.id,
			Name:      t.name,
			Color:     nullStringToAny(t.color),
			SortOrder: nullIntToAny(t.sortOrder),
			CreatedAt: nullStringToAny(t.createdAt),
			UpdatedAt: nullStringToAny(t.updatedAt),
			Members:   members,
		})
	}
	return result, nil
}

// topicMembers 读取单个主题的成员列表。
func (s *Server) topicMembers(topicID int64) ([]topicMemberJSON, error) {
	rows, err := s.crm.Query(`
        SELECT id, contact_id, name, sort_order, remark
        FROM contact_topic_members
        WHERE topic_id = ?
        ORDER BY sort_order ASC, id ASC
    `, topicID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]topicMemberJSON, 0)
	for rows.Next() {
		var (
			id        int64
			contactID sql.NullString
			name      string
			sortOrder sql.NullInt64
			remark    sql.NullString
		)
		if err := rows.Scan(&id, &contactID, &name, &sortOrder, &remark); err != nil {
			return nil, err
		}
		members = append(members, topicMemberJSON{
			ID:        id,
			ContactID: contactID.String, // m.contactId || ""
			Name:      name,
			SortOrder: nullIntToAny(sortOrder),
			Remark:    remark.String, // m.remark || ""
		})
	}
	return members, rows.Err()
}

// topicMemberNew 前端成员规范化结果。
type topicMemberNew struct {
	id        int64 // 0 表示无主键
	hasID     bool
	name      string
	contactID any // nil 或 string
	sortOrder int64
	remark    string
}

// replaceTopicMembers 精准重构主题成员：以物理主键作差异比对，
// 删除已移除的记录、按需更新变化记录、插入全新记录（须在事务内调用）。
func replaceTopicMembers(tx *sql.Tx, topicID any, members []topicMemberPayload) error {
	// 1. 获取当前数据库中该主题已存在的所有成员记录
	oldRows, err := tx.Query(`SELECT id as pk, contact_id, name, sort_order, remark FROM contact_topic_members WHERE topic_id = ?`, topicID)
	if err != nil {
		return err
	}
	type oldMember struct {
		pk        int64
		contactID sql.NullString
		name      string
		sortOrder sql.NullInt64
		remark    sql.NullString
	}
	var oldMembers []oldMember
	for oldRows.Next() {
		var m oldMember
		if err := oldRows.Scan(&m.pk, &m.contactID, &m.name, &m.sortOrder, &m.remark); err != nil {
			oldRows.Close()
			return err
		}
		oldMembers = append(oldMembers, m)
	}
	oldRows.Close()
	if err := oldRows.Err(); err != nil {
		return err
	}

	// 2. 规范化前端传入的数据
	newMembers := make([]topicMemberNew, 0, len(members))
	for _, member := range members {
		name := strings.TrimSpace(jsNullOrUndefinedToEmpty(member.Name))
		if name == "" {
			continue // 过滤 m.name 为空的记录
		}
		contactID := strings.TrimSpace(jsNullOrUndefinedToEmpty(member.ContactID))
		id, hasID := memberRecordID(member.ID)
		newMembers = append(newMembers, topicMemberNew{
			id:        id,
			hasID:     hasID,
			name:      name,
			contactID: nilIfEmpty(contactID),
			sortOrder: int64(len(newMembers)),
			remark:    strings.TrimSpace(jsNullOrUndefinedToEmpty(member.Remark)),
		})
	}

	// 3. 老数据主键映射与新数据主键集合
	oldMembersMap := make(map[int64]oldMember, len(oldMembers))
	for _, m := range oldMembers {
		oldMembersMap[m.pk] = m
	}
	newMembersIDs := make(map[int64]bool, len(newMembers))
	for _, m := range newMembers {
		if m.hasID {
			newMembersIDs[m.id] = true
		}
	}

	// 4. 差异化删除：物理主键不在前端传回的集合里，说明该成员已被彻底移除
	for _, oldRow := range oldMembers {
		if !newMembersIDs[oldRow.pk] {
			if _, err := tx.Exec(`DELETE FROM contact_topic_members WHERE id = ?`, oldRow.pk); err != nil {
				return err
			}
		}
	}

	// 5. 精准更新或按需新增
	for _, newMem := range newMembers {
		if oldRow, ok := oldMembersMap[newMem.id]; ok && newMem.hasID {
			// 情况 A：物理记录存在，在原记录上精准修改
			contactChanged := oldRow.contactID.Valid != (newMem.contactID != nil) ||
				(newMem.contactID != nil && oldRow.contactID.String != newMem.contactID.(string))
			sortChanged := !oldRow.sortOrder.Valid || oldRow.sortOrder.Int64 != newMem.sortOrder
			if contactChanged || oldRow.name != newMem.name || sortChanged || oldRow.remark.String != newMem.remark {
				if _, err := tx.Exec(`
                    UPDATE contact_topic_members
                    SET contact_id = ?, name = ?, sort_order = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, newMem.contactID, newMem.name, newMem.sortOrder, newMem.remark, newMem.id); err != nil {
					return err
				}
			}
		} else {
			// 情况 B：没有主键，判定为完全新增的成员
			if _, err := tx.Exec(`
                INSERT INTO contact_topic_members (topic_id, contact_id, name, sort_order, remark)
                VALUES (?, ?, ?, ?, ?)
            `, topicID, newMem.contactID, newMem.name, newMem.sortOrder, newMem.remark); err != nil {
				return err
			}
		}
	}
	return nil
}

// ==========================================
// 值转换辅助
// ==========================================

// topicColor 解析 color 字段：未传时默认 '#ffffff'（对齐解构默认值，
// 显式 null 保持 null），返回 (值, 是否为有效颜色)。
func topicColor(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "#ffffff", true // 解构默认值：color = '#ffffff'
	}
	if string(raw) == "null" {
		return "", false // 显式 null 保持 null
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", true
	}
	return s, true
}

// rawStringOrEmpty 将 JSON 原始值按 JS `String(x || ”)` 语义转为字符串。
func rawStringOrEmpty(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	return web.JSStringOrEmpty(v)
}

// jsNullOrUndefinedToEmpty 复刻 `(x || ”)`：null/undefined 归空串，其余按 String() 转换。
func jsNullOrUndefinedToEmpty(v any) string {
	if v == nil {
		return ""
	}
	return web.JSStringOrEmpty(v)
}

// memberRecordID 复刻 `member.id ? Number(member.id) : null`：
// 返回 (id, true) 表示有效物理主键；假值或 NaN 归为无效。
func memberRecordID(v any) (int64, bool) {
	var f float64
	switch t := v.(type) {
	case float64:
		f = t
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		if err != nil {
			return 0, false // Number("abc") = NaN，为假值
		}
		f = n
	case json.Number:
		n, err := t.Float64()
		if err != nil {
			return 0, false
		}
		f = n
	case bool:
		if !t {
			return 0, false
		}
		f = 1
	default:
		return 0, false
	}
	if math.IsNaN(f) || f == 0 || f != math.Trunc(f) {
		return 0, false
	}
	return int64(f), true
}

// nullIntToAny 保留 NULL 语义输出 JSON null。
func nullIntToAny(ni sql.NullInt64) any {
	if !ni.Valid {
		return nil
	}
	return ni.Int64
}

// topicOrNull 主题不存在时输出 null（对齐 res.json 中 undefined 的缺省效果）。
func topicOrNull(topics []topicJSON) any {
	if len(topics) == 0 {
		return nil
	}
	return topics[0]
}

// strPtrToAny 将 *string 包装为 *any（供 topicsWithMembers 复用查询逻辑）。
func strPtrToAny(p *string) *any {
	var v any = *p
	return &v
}
