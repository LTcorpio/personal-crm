package api

// ==========================================
// 标签管理：标签树、排序、重命名、安全级联删除
// （对应 contactController.js 的 getTagTree/updateTagsOrder/updateTag/deleteTag）
// ==========================================

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"crm-server/internal/web"
)

// tagRef 标签基础信息（树构建与级联删除共用）。
type tagRef struct {
	id       int64
	name     string
	parentID sql.NullInt64
}

// tagTreeNode 标签树节点输出结构。
type tagTreeNode struct {
	ID       int64         `json:"id"`
	Name     string        `json:"name"`
	Children []tagTreeNode `json:"children"`
}

// handleGetTagTree 获取多层级标签树结构。
func (s *Server) handleGetTagTree(w http.ResponseWriter, r *http.Request) {
	allTags, err := s.loadTagRefs()
	if err != nil {
		logServerError("获取标签树失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "获取标签树失败"})
		return
	}

	var buildTree func(parentID *int64) []tagTreeNode
	buildTree = func(parentID *int64) []tagTreeNode {
		children := make([]tagTreeNode, 0)
		for _, t := range allTags {
			// 对齐 JS 的 t.parent_id === parentId（NULL 严格等于 null）
			var match bool
			if parentID == nil {
				match = !t.parentID.Valid
			} else {
				match = t.parentID.Valid && t.parentID.Int64 == *parentID
			}
			if !match {
				continue
			}
			id := t.id
			children = append(children, tagTreeNode{
				ID:       t.id,
				Name:     t.name,
				Children: buildTree(&id),
			})
		}
		return children
	}

	web.WriteJSON(w, http.StatusOK, buildTree(nil))
}

// handleUpdateTagsOrder 批量调整标签顺序。
func (s *Server) handleUpdateTagsOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TagIDs []any `json:"tagIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.TagIDs == nil {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "参数异常，tagIds 必须为数组"})
		return
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("更新标签排序失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "后端排序保存失败"})
		return
	}
	rollback := func() { _ = tx.Rollback() }

	for index, id := range body.TagIDs {
		if _, err := tx.Exec(
			`UPDATE tags SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			index, jsSQLValue(id),
		); err != nil {
			rollback()
			logServerError("更新标签排序失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "后端排序保存失败"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("更新标签排序失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "后端排序保存失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "标签排序更新成功"})
}

// handleUpdateTag 修改标签名称。
func (s *Server) handleUpdateTag(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name *string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	tagName := ""
	if body.Name != nil {
		tagName = strings.TrimSpace(*body.Name)
	}
	if tagName == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "标签名称不能为空"})
		return
	}

	if _, err := s.crm.Exec(
		`UPDATE tags SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		tagName, r.PathValue("id"),
	); err != nil {
		logServerError("更新标签失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部错误"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "标签名称更新成功"})
}

// handleDeleteTag 安全级联删除标签：任一目标标签仍绑定联系人时拒绝删除，
// 否则删除根标签并依赖外键级联清除子层级。
func (s *Server) handleDeleteTag(w http.ResponseWriter, r *http.Request) {
	idParam := r.PathValue("id")

	allTags, err := s.loadTagRefs()
	if err != nil {
		logServerError("删除标签失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部删除失败"})
		return
	}

	// Number(id)：非数字的 id 在 JS 中为 NaN，任何标签均无法匹配
	rootID, parseErr := strconv.ParseInt(idParam, 10, 64)
	var targetTagIDs []int64
	if parseErr == nil {
		targetTagIDs = collectTagIDs(allTags, rootID)
	}

	if len(targetTagIDs) > 0 {
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(targetTagIDs)), ",")
		params := make([]any, len(targetTagIDs))
		for i, id := range targetTagIDs {
			params[i] = id
		}
		var count int64
		if err := s.crm.QueryRow(
			`SELECT COUNT(*) as count FROM contact_tags WHERE tag_id IN (`+placeholders+`)`,
			params...,
		).Scan(&count); err != nil {
			logServerError("删除标签失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部删除失败"})
			return
		}
		if count > 0 {
			web.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false,
				"message": "由于该标签或子标签下仍绑定有联系人，无法删除，请先调整人员标签",
			})
			return
		}
	}

	// 仅删除根标签；子层级依赖 tags 表的 ON DELETE CASCADE 外键清除
	if _, err := s.crm.Exec(`DELETE FROM tags WHERE id = ?`, idParam); err != nil {
		logServerError("删除标签失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部删除失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "标签及相关子层级已安全移除"})
}

// loadTagRefs 读取全部标签（不含排序，供级联删除使用）。
func (s *Server) loadTagRefs() ([]tagRef, error) {
	rows, err := s.crm.Query(`SELECT id, name, parent_id FROM tags`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var refs []tagRef
	for rows.Next() {
		var t tagRef
		if err := rows.Scan(&t.id, &t.name, &t.parentID); err != nil {
			return nil, err
		}
		refs = append(refs, t)
	}
	return refs, rows.Err()
}

// collectTagIDs 递归收集目标标签及其全部子孙标签的 ID。
func collectTagIDs(allTags []tagRef, currentID int64) []int64 {
	ids := []int64{currentID}
	for _, t := range allTags {
		if t.parentID.Valid && t.parentID.Int64 == currentID {
			ids = append(ids, collectTagIDs(allTags, t.id)...)
		}
	}
	return ids
}
