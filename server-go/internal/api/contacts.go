package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"math"
	"math/rand/v2"
	"net/http"
	"reflect"
	"strings"
	"time"

	"crm-server/internal/config"
	"crm-server/internal/web"
)

// ==========================================
// 请求 / 响应结构（字段与 Node 版 JSON 完全对齐）
// ==========================================

type relatedPayload struct {
	ID        string `json:"id"`
	ContactID string `json:"contactId"`
	Name      string `json:"name"`
	Relation  string `json:"relation"`
	Remark    string `json:"remark"`
}

type saveContactPayload struct {
	ID            string           `json:"id"`
	FaceUUID      string           `json:"face_uuid"`
	Name          string           `json:"name"`
	Gender        json.RawMessage  `json:"gender"`
	Ethnicity     string           `json:"ethnicity"`
	NativePlace   string           `json:"native_place"`
	Title         string           `json:"title"`
	BirthdaySolar string           `json:"birthday_solar"`
	BirthdayLunar string           `json:"birthday_lunar"`
	Deathday      string           `json:"deathday"`
	IDCard        string           `json:"id_card"`
	Location      string           `json:"location"`
	Address       string           `json:"address"`
	Extra         string           `json:"extra"`
	Remark        string           `json:"remark"`
	FormerName    []any            `json:"former_name"`
	Contact       map[string]any   `json:"contact"`
	Related       []relatedPayload `json:"related"`
	Tag           []any            `json:"tag"`
}

// contactMethodRow / oldRelationRow / tagRow 为差异比对所需的子表数据。

type contactMethodRow struct {
	typ   string
	value string
}

type oldRelationRow struct {
	pk               int64
	relatedContactID sql.NullString
	name             string
	relation         string
	remark           sql.NullString
	sortOrder        sql.NullInt64
}

type tagRow struct {
	id       int64
	name     string
	parentID sql.NullInt64
}

const contactColumns = `id, face_uuid, name, gender, ethnicity, native_place, title, birthday_solar, birthday_lunar, deathday, id_card, location, address, extra, remark, sort_order, created_at, updated_at, avatar_hash`

type contactRecord struct {
	id            string
	faceUUID      sql.NullString
	name          string
	gender        any
	ethnicity     sql.NullString
	nativePlace   sql.NullString
	title         sql.NullString
	birthdaySolar sql.NullString
	birthdayLunar sql.NullString
	deathday      sql.NullString
	idCard        sql.NullString
	location      sql.NullString
	address       sql.NullString
	extra         sql.NullString
	remark        sql.NullString
	sortOrder     sql.NullInt64
	createdAt     sql.NullString
	updatedAt     sql.NullString
	avatarHash    sql.NullString
}

func scanContact(scanner interface{ Scan(dest ...any) error }) (*contactRecord, error) {
	var c contactRecord
	err := scanner.Scan(
		&c.id, &c.faceUUID, &c.name, &c.gender, &c.ethnicity, &c.nativePlace, &c.title,
		&c.birthdaySolar, &c.birthdayLunar, &c.deathday, &c.idCard, &c.location, &c.address,
		&c.extra, &c.remark, &c.sortOrder, &c.createdAt, &c.updatedAt, &c.avatarHash,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ==========================================
// 1. 创建或更新联系人（加入精确差异比对，无修改不刷时间戳）
// ==========================================

func (s *Server) handleSaveContact(w http.ResponseWriter, r *http.Request) {
	var data saveContactPayload
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	writeErr := func() {
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部错误"})
	}

	var (
		isExisting        bool
		mainFieldsChanged bool
		oldFaceUUID       string
		oldName           string
		methodsRows       []contactMethodRow
		relationsRows     []oldRelationRow
		formerNames       []string
		tagPaths          []string
	)

	// === 1. 幂等与差异检查：如果传了 id，先检查数据是否真正发生了改变 ===
	if data.ID != "" {
		rec, err := scanContact(s.crm.QueryRow(`SELECT `+contactColumns+` FROM contacts WHERE id = ?`, data.ID))
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
		if rec != nil {
				isExisting = true
				oldFaceUUID = rec.faceUUID.String
				oldName = rec.name

			if formerNames, err = s.loadFormerNames(data.ID); err != nil {
				logServerError("保存联系人失败:", err)
				writeErr()
				return
			}
			if methodsRows, err = s.loadContactMethods(data.ID); err != nil {
				logServerError("保存联系人失败:", err)
				writeErr()
				return
			}
			if relationsRows, err = s.loadOldRelations(data.ID); err != nil {
				logServerError("保存联系人失败:", err)
				writeErr()
				return
			}
			if tagPaths, err = s.fullTagPaths(data.ID); err != nil {
				logServerError("保存联系人失败:", err)
				writeErr()
				return
			}

			oldSnapshot := buildOldSnapshot(rec, formerNames, methodsRows, relationsRows, tagPaths)
			newSnapshot := buildNewSnapshot(&data)

			// 深度核心比对：完全一致说明用户未做任何修改，直接返回成功
			if reflect.DeepEqual(oldSnapshot, newSnapshot) {
				web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "资料未发生变更，无需保存", "id": data.ID})
				return
			}

			// 检查主表核心文本字段是否发生实质性变动
			oldGender := dbStringOrEmpty(rec.gender)
			newGender := genderString(data.Gender)
			mainFieldsChanged =
				rec.faceUUID.String != data.FaceUUID ||
					rec.name != data.Name ||
					oldGender != newGender ||
					rec.ethnicity.String != data.Ethnicity ||
					rec.nativePlace.String != data.NativePlace ||
					rec.title.String != data.Title ||
					rec.birthdaySolar.String != data.BirthdaySolar ||
					rec.birthdayLunar.String != data.BirthdayLunar ||
					rec.deathday.String != data.Deathday ||
					rec.idCard.String != data.IDCard ||
					rec.location.String != data.Location ||
					rec.address.String != data.Address ||
					rec.extra.String != data.Extra ||
					rec.remark.String != data.Remark
		}
	}

	// === 2. 实质性写入：数据确认有改变或为全新数据，执行数据库写入 ===
	finalContactID := data.ID
	if finalContactID == "" {
		finalContactID = randomContactID()
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("保存联系人失败:", err)
		writeErr()
		return
	}
	rollback := func() { _ = tx.Rollback() }

	mainParams := []any{
		nilIfEmpty(data.FaceUUID), data.Name, genderValue(data.Gender), nilIfEmpty(data.Ethnicity),
		nilIfEmpty(data.NativePlace), nilIfEmpty(data.Title), nilIfEmpty(data.BirthdaySolar),
		nilIfEmpty(data.BirthdayLunar), nilIfEmpty(data.Deathday), nilIfEmpty(data.IDCard), nilIfEmpty(data.Location),
		nilIfEmpty(data.Address), data.Extra, data.Remark,
	}

	if !isExisting {
		// 全新录入：追加到列表末尾，避免落到 DEFAULT 0 后挤到最前面
		var maxOrder sql.NullInt64
		if err := tx.QueryRow(`SELECT MAX(sort_order) AS max_order FROM contacts`).Scan(&maxOrder); err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
		nextOrder := int64(0)
		if maxOrder.Valid {
			nextOrder = maxOrder.Int64 + 1
		}

		// 全新录入：直接插入主表
		insertParams := append([]any{finalContactID}, mainParams...)
		insertParams = append(insertParams, nextOrder)
		if _, err := tx.Exec(`
            INSERT INTO contacts (id, face_uuid, name, gender, ethnicity, native_place, title, birthday_solar, birthday_lunar, deathday, id_card, location, address, extra, remark, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, insertParams...); err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
	} else if mainFieldsChanged {
		// 已有记录且主表核心字段有变动：更新主表并刷新 updated_at
		if _, err := tx.Exec(`
            UPDATE contacts SET
                face_uuid=?, name=?, gender=?, ethnicity=?, native_place=?, title=?,
                birthday_solar=?, birthday_lunar=?, deathday=?, id_card=?, location=?,
                address=?, extra=?, remark=?, updated_at=CURRENT_TIMESTAMP
            WHERE id = ?
        `, append(mainParams, finalContactID)...); err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
	}
	// 注：如果仅仅修改了电话或标签，此处将完全略过主表更新，主表 updated_at 保持不变。

	// 改名后回写所有引用该联系人的关联人姓名快照（related_name），
	// 保证「B 的关联人里 A 的名字」随 A 改名自动同步。
	if isExisting && oldName != data.Name {
		if _, err := tx.Exec(`UPDATE contact_relations SET related_name = ? WHERE related_contact_id = ?`, data.Name, finalContactID); err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
	}

	// 曾用名：全清后按新顺序重新插入，以保持拖拽后的物理顺序
	newNames := make([]string, 0, len(data.FormerName))
	for _, v := range data.FormerName {
		if web.Truthy(v) {
			newNames = append(newNames, web.JSString(v))
		}
	}
	if _, err := tx.Exec(`DELETE FROM former_names WHERE contact_id = ?`, finalContactID); err != nil {
		rollback()
		logServerError("保存联系人失败:", err)
		writeErr()
		return
	}
	for _, name := range newNames {
		if _, err := tx.Exec(`INSERT INTO former_names (contact_id, name) VALUES (?, ?)`, finalContactID, name); err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
	}

	// 联系方式：对「内置 5 类 + 任意自定义类型」做精准子项比对，按需单条增删改
	oldContactMethods := map[string]string{}
	for _, m := range methodsRows {
		if strings.TrimSpace(m.value) != "" {
			oldContactMethods[m.typ] = m.value
		}
	}
	newContactMethods := map[string]string{}
	for typ, v := range data.Contact {
		typ = strings.TrimSpace(typ)
		if typ == "" {
			continue
		}
		newContactMethods[typ] = strings.TrimSpace(web.JSStringOrEmpty(v))
	}

	allTypes := map[string]bool{}
	for typ := range oldContactMethods {
		allTypes[typ] = true
	}
	for typ := range newContactMethods {
		allTypes[typ] = true
	}
	for typ := range allTypes {
		oldVal, newVal := oldContactMethods[typ], newContactMethods[typ]
		if oldVal == newVal {
			continue
		}
		var err error
		switch {
		case newVal == "":
			// 新值置空，说明删除了该项
			_, err = tx.Exec(`DELETE FROM contact_methods WHERE contact_id = ? AND type = ?`, finalContactID, typ)
		case oldVal == "":
			// 老值为空，说明是新增
			_, err = tx.Exec(`INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)`, finalContactID, typ, newVal)
		default:
			// 两者都不为空且不相等，说明只是单条修改，更新单条并刷新该子项的 updated_at
			_, err = tx.Exec(`UPDATE contact_methods SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ? AND type = ?`, newVal, finalContactID, typ)
		}
		if err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
	}

	// 关联人关系：根据复合键作实体比对，并依据关联主键精准更新
	oldRelationsMap := make(map[string]oldRelationRow, len(relationsRows))
	for _, row := range relationsRows {
		key := strings.Join([]string{row.relatedContactID.String, row.name, row.relation}, "\t")
		oldRelationsMap[key] = row
	}

	newRelations := make([]relatedPayload, 0, len(data.Related))
	newRelationKeys := make(map[string]bool, len(data.Related))
	for _, rel := range data.Related {
		id := rel.ID
		if id == "" {
			id = rel.ContactID // 兼容前端可能传入的 contactId
		}
		normalized := relatedPayload{ID: id, Name: rel.Name, Relation: rel.Relation, Remark: rel.Remark}
		newRelations = append(newRelations, normalized)
		newRelationKeys[strings.Join([]string{normalized.ID, normalized.Name, normalized.Relation}, "\t")] = true
	}

	// 移除多余的关联
	for key, oldRow := range oldRelationsMap {
		if !newRelationKeys[key] {
			if _, err := tx.Exec(`DELETE FROM contact_relations WHERE id = ?`, oldRow.pk); err != nil {
				rollback()
				logServerError("保存联系人失败:", err)
				writeErr()
				return
			}
		}
	}
	// 按需新增或单独更新单条备注
	for i, newRel := range newRelations {
		key := strings.Join([]string{newRel.ID, newRel.Name, newRel.Relation}, "\t")
		if oldRow, ok := oldRelationsMap[key]; ok {
			// 只要备注变了，或者在前端的拖动排序（sort_order）变了，就执行更新
			sortChanged := !oldRow.sortOrder.Valid || oldRow.sortOrder.Int64 != int64(i)
			if oldRow.remark.String != newRel.Remark || sortChanged {
				if _, err := tx.Exec(`
                    UPDATE contact_relations
                    SET remark = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, newRel.Remark, i, oldRow.pk); err != nil {
					rollback()
					logServerError("保存联系人失败:", err)
					writeErr()
					return
				}
			}
		} else {
			// 全新关联项，正常插入排序权重
			if _, err := tx.Exec(`
                INSERT INTO contact_relations (contact_id, related_contact_id, related_name, relation, remark, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            `, finalContactID, nilIfEmpty(newRel.ID), newRel.Name, newRel.Relation, newRel.Remark, i); err != nil {
				rollback()
				logServerError("保存联系人失败:", err)
				writeErr()
				return
			}
		}
	}

	// 标签：精准关联差异计算（ensureTagPath 需在事务内执行以保持一致性）
	newTagIds := make([]int64, 0, len(data.Tag))
	for _, t := range data.Tag {
		leafTagID, err := ensureTagPath(tx, web.JSString(t))
		if err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
		if leafTagID != 0 {
			newTagIds = append(newTagIds, leafTagID)
		}
	}
	// 标签全清全交
	if _, err := tx.Exec(`DELETE FROM contact_tags WHERE contact_id = ?`, finalContactID); err != nil {
		rollback()
		logServerError("保存联系人失败:", err)
		writeErr()
		return
	}
	for _, tagID := range newTagIds {
		if _, err := tx.Exec(`INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`, finalContactID, tagID); err != nil {
			rollback()
			logServerError("保存联系人失败:", err)
			writeErr()
			return
		}
	}

	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("保存联系人失败:", err)
		writeErr()
		return
	}

	// === 3. 人脸 UUID 变更后，把新头像抓到本地并记为当前头像 ===
	// 刻意放在事务之外：抓图是外部网络调用，失败也不该影响联系人资料本身的保存。
	// 若这次抓取失败，头像保持原样，后续「启动补全 / 手动同步」会再次补齐。
	if newFaceUUID := strings.TrimSpace(data.FaceUUID); newFaceUUID != oldFaceUUID && newFaceUUID != "" {
		s.captureImmichAvatar(r.Context(), finalContactID, newFaceUUID)
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "保存成功", "id": finalContactID})
}

// avatarCaptureTimeout 保存联系人时同步补抓头像的超时上限。
// 比常规抓取更短：Immich 异常时也不能让「保存联系人」长时间卡住。
const avatarCaptureTimeout = 4 * time.Second

// captureImmichAvatar 把某个 face_uuid 对应的头像抓到本地，并设为该联系人的当前头像。
// 失败只记日志（联系人资料已保存成功），下次启动补全或手动同步会再补。
func (s *Server) captureImmichAvatar(ctx context.Context, contactID, faceUUID string) {
	if !config.ImmichConfigured() {
		return
	}
	// 表单保存不应被客户端断开连带取消，因此脱离请求上下文，只保留超时约束
	fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), avatarCaptureTimeout)
	defer cancel()

	data, _, err := fetchImmichThumbnail(fetchCtx, faceUUID)
	if err != nil {
		log.Printf("[头像] 自动抓取失败（联系人 %s / UUID %s）: %v", contactID, faceUUID, err)
		return
	}
	if _, err := s.recordAvatar(recordAvatarInput{
		ContactID:  contactID,
		Data:       data,
		FaceUUID:   faceUUID,
		Source:     avatarSourceImmich,
		SetCurrent: true,
	}); err != nil {
		log.Printf("[头像] 自动保存失败（联系人 %s）: %v", contactID, err)
		return
	}
	log.Printf("[头像] 已随联系人保存自动更新头像（联系人 %s / UUID %s）", contactID, faceUUID)
}

// ==========================================
// 2. 获取联系人详情与列表（带关键字及标签筛选）
// ==========================================

func (s *Server) handleGetContacts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	search, tag, id := q.Get("search"), q.Get("tag"), q.Get("id")
	fieldsParam := q.Get("fields")

	var sqlText strings.Builder
	var params []any
	sqlText.WriteString(`SELECT ` + contactColumns + ` FROM contacts WHERE 1=1`)

	if id != "" {
		sqlText.WriteString(` AND id = ?`)
		params = append(params, id)
	}
	if search != "" {
		allowedFields := []string{
			"name", "title", "ethnicity", "native_place", "location",
			"address", "id_card", "birthday_solar", "birthday_lunar",
			"deathday", "extra", "remark", "former_name", "contact", "related",
		}

		var targetFields []string
		if fieldsParam != "" {
			for _, f := range strings.Split(fieldsParam, ",") {
				for _, allowed := range allowedFields {
					if f == allowed {
						targetFields = append(targetFields, f)
						break
					}
				}
			}
		} else {
			targetFields = allowedFields
		}
		if len(targetFields) == 0 {
			targetFields = []string{"name"}
		}

		var searchConditions []string
		for _, field := range targetFields {
			switch field {
			case "former_name":
				searchConditions = append(searchConditions, `EXISTS (SELECT 1 FROM former_names fn WHERE fn.contact_id = contacts.id AND fn.name LIKE ?)`)
				params = append(params, "%"+search+"%")
			case "contact":
				searchConditions = append(searchConditions, `EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.contact_id = contacts.id AND cm.value LIKE ?)`)
				params = append(params, "%"+search+"%")
			case "related":
				searchConditions = append(searchConditions, `EXISTS (SELECT 1 FROM contact_relations cr WHERE cr.contact_id = contacts.id AND cr.related_name LIKE ?)`)
				params = append(params, "%"+search+"%")
			default:
				searchConditions = append(searchConditions, "contacts."+field+" LIKE ?")
				params = append(params, "%"+search+"%")
			}
		}
		sqlText.WriteString(` AND (` + strings.Join(searchConditions, " OR ") + `)`)
	}

	if tag != "" {
		sqlText.WriteString(` AND id IN (
            SELECT contact_id FROM contact_tags WHERE tag_id IN (
                SELECT id FROM tags WHERE name = ?
            )
        )`)
		params = append(params, tag)
	}

	if id == "" {
		sqlText.WriteString(` ORDER BY sort_order ASC`)
	}

	rows, err := s.crm.Query(sqlText.String(), params...)
	if err != nil {
		logServerError("获取联系人失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "获取数据失败"})
		return
	}
	defer rows.Close()

	var records []*contactRecord
	for rows.Next() {
		rec, err := scanContact(rows)
		if err != nil {
			logServerError("获取联系人失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "获取数据失败"})
			return
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		logServerError("获取联系人失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "获取数据失败"})
		return
	}

	// 一次取出全部「哈希 → 文件名」映射，避免为每位联系人单独查询当前头像文件名
	avatarFileNames := s.loadAvatarFileNames()

	result := make([]contactJSON, 0, len(records))
	for _, rec := range records {
		item, err := s.buildContactJSON(rec, avatarFileNames)
		if err != nil {
			logServerError("获取联系人失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "获取数据失败"})
			return
		}
		result = append(result, *item)
	}

	if id != "" {
		if len(result) == 0 {
			web.WriteJSON(w, http.StatusOK, nil) // res.json(null)
			return
		}
		web.WriteJSON(w, http.StatusOK, result[0])
		return
	}
	web.WriteJSON(w, http.StatusOK, result)
}

// ==========================================
// 3. 删除联系人
// ==========================================

func (s *Server) handleDeleteContact(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")

	// 先把该联系人名下的头像文件登记下来：删除联系人会级联清空 contact_avatars，
	// 之后需要据此回收磁盘上已无任何引用的图片。
	type avatarFile struct{ hash, fileName string }
	var owned []avatarFile

	rows, err := s.crm.Query(`
        SELECT hash, file_name, original_hash, original_file_name
        FROM contact_avatars WHERE contact_id = ?
    `, contactID)
	if err != nil {
		logServerError("删除联系人失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "删除失败"})
		return
	}
	for rows.Next() {
		var (
			f        avatarFile
			origHash sql.NullString
			origName sql.NullString
		)
		if err := rows.Scan(&f.hash, &f.fileName, &origHash, &origName); err != nil {
			rows.Close()
			logServerError("删除联系人失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "删除失败"})
			return
		}
		owned = append(owned, f)
		// 原图也一起登记：级联删除后同样按引用计数决定是否回收
		if origHash.Valid && origHash.String != "" {
			owned = append(owned, avatarFile{origHash.String, origName.String})
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		logServerError("删除联系人失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "删除失败"})
		return
	}

	if _, err := s.crm.Exec(`DELETE FROM contacts WHERE id = ?`, contactID); err != nil {
		logServerError("删除联系人失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "删除失败"})
		return
	}

	// 级联删除后仍被其他联系人引用的图片会被 gcAvatarFile 保留
	for _, f := range owned {
		s.gcAvatarFile(f.hash, f.fileName)
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "删除成功"})
}

// ==========================================
// 12. 更新所有人员全局排序序列
// ==========================================

func (s *Server) handleUpdateContactsOrder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ContactIDs []any `json:"contactIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.ContactIDs == nil {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "参数错误"})
		return
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("更新人员序列失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "人员顺序更新失败"})
		return
	}
	rollback := func() { _ = tx.Rollback() }

	for index, id := range body.ContactIDs {
		if _, err := tx.Exec(`UPDATE contacts SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, index, jsSQLValue(id)); err != nil {
			rollback()
			logServerError("更新人员序列失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "人员顺序更新失败"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("更新人员序列失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "人员顺序更新失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "人员顺序更新成功"})
}

// ==========================================
// 数据装载辅助
// ==========================================

func (s *Server) loadFormerNames(contactID string) ([]string, error) {
	rows, err := s.crm.Query(`SELECT name FROM former_names WHERE contact_id = ?`, contactID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func (s *Server) loadContactMethods(contactID string) ([]contactMethodRow, error) {
	rows, err := s.crm.Query(`SELECT type, value FROM contact_methods WHERE contact_id = ?`, contactID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var methods []contactMethodRow
	for rows.Next() {
		var m contactMethodRow
		if err := rows.Scan(&m.typ, &m.value); err != nil {
			return nil, err
		}
		methods = append(methods, m)
	}
	return methods, rows.Err()
}

func (s *Server) loadOldRelations(contactID string) ([]oldRelationRow, error) {
	rows, err := s.crm.Query(`
        SELECT id as pk, related_contact_id as id, related_name as name, relation, remark, sort_order
        FROM contact_relations
        WHERE contact_id = ?
        ORDER BY sort_order ASC
    `, contactID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var relations []oldRelationRow
	for rows.Next() {
		var row oldRelationRow
		if err := rows.Scan(&row.pk, &row.relatedContactID, &row.name, &row.relation, &row.remark, &row.sortOrder); err != nil {
			return nil, err
		}
		relations = append(relations, row)
	}
	return relations, rows.Err()
}

// fullTagPaths 递归拼装全路径标签（例如将标签 ID 转为 "同学/大学同学/智能1班"）。
func (s *Server) fullTagPaths(contactID string) ([]string, error) {
	rows, err := s.crm.Query(`
        SELECT t.id, t.name, t.parent_id FROM contact_tags ct
        JOIN tags t ON ct.tag_id = t.id
        WHERE ct.contact_id = ?
    `, contactID)
	if err != nil {
		return nil, err
	}
	var tags []tagRow
	for rows.Next() {
		var t tagRow
		if err := rows.Scan(&t.id, &t.name, &t.parentID); err != nil {
			rows.Close()
			return nil, err
		}
		tags = append(tags, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	allTags, err := s.loadAllTags()
	if err != nil {
		return nil, err
	}

	paths := make([]string, 0, len(tags))
	for _, tag := range tags {
		path := tag.name
		curr := tag
		for curr.parentID.Valid {
			parent, ok := allTags[curr.parentID.Int64]
			if !ok {
				break
			}
			path = parent.name + "/" + path
			curr = parent
		}
		paths = append(paths, path)
	}
	return paths, nil
}

func (s *Server) loadAllTags() (map[int64]tagRow, error) {
	rows, err := s.crm.Query(`SELECT id, name, parent_id FROM tags`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[int64]tagRow)
	for rows.Next() {
		var t tagRow
		if err := rows.Scan(&t.id, &t.name, &t.parentID); err != nil {
			return nil, err
		}
		result[t.id] = t
	}
	return result, rows.Err()
}

// ensureTagPath 确保多层级标签存在，并返回叶子节点 ID（须在事务内调用）。
// 新建的标签会追加到同级末尾，而不是落到 sort_order 的 DEFAULT 0 挤在最前面。
func ensureTagPath(tx *sql.Tx, pathStr string) (int64, error) {
	var parts []string
	for _, p := range strings.Split(pathStr, "/") {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	var parentID any // nil 或 int64
	for _, part := range parts {
		var id int64
		err := tx.QueryRow(
			`SELECT id FROM tags WHERE name = ? AND (parent_id = ? OR (? IS NULL AND parent_id IS NULL))`,
			part, parentID, parentID,
		).Scan(&id)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			// 新标签追加到同级末尾：取同级最大 sort_order + 1
			var maxOrder sql.NullInt64
			if err := tx.QueryRow(
				`SELECT MAX(sort_order) AS max_order FROM tags WHERE parent_id = ? OR (? IS NULL AND parent_id IS NULL)`,
				parentID, parentID,
			).Scan(&maxOrder); err != nil {
				return 0, err
			}
			nextOrder := int64(0)
			if maxOrder.Valid {
				nextOrder = maxOrder.Int64 + 1
			}
			res, err := tx.Exec(`INSERT INTO tags (name, parent_id, sort_order) VALUES (?, ?, ?)`, part, parentID, nextOrder)
			if err != nil {
				return 0, err
			}
			lastID, err := res.LastInsertId()
			if err != nil {
				return 0, err
			}
			parentID = lastID
		case err != nil:
			return 0, err
		default:
			parentID = id
		}
	}
	if pid, ok := parentID.(int64); ok {
		return pid, nil
	}
	return 0, nil
}

// buildContactJSON 组装单条联系人的完整输出。
// avatarFileNames 是「哈希 → 头像文件名」的全量映射，由调用方一次性查好后传入。
func (s *Server) buildContactJSON(rec *contactRecord, avatarFileNames map[string]string) (*contactJSON, error) {
	formerNames, err := s.loadFormerNames(rec.id)
	if err != nil {
		return nil, err
	}
	methodsRows, err := s.loadContactMethods(rec.id)
	if err != nil {
		return nil, err
	}
	// 与 Node 版一致：以五个固定键起步，且不过滤历史遗留的其它类型
	contactMethods := map[string]string{"wechat": "", "qq": "", "email": "", "tel": "", "tiktok": ""}
	for _, m := range methodsRows {
		contactMethods[m.typ] = m.value
	}

	relationsRows, err := s.crm.Query(`
        SELECT related_contact_id as id, related_name as name, relation, remark
        FROM contact_relations
        WHERE contact_id = ?
        ORDER BY sort_order ASC
    `, rec.id)
	if err != nil {
		return nil, err
	}
	related := make([]relatedJSON, 0)
	for relationsRows.Next() {
		var (
			relID    sql.NullString
			name     string
			relation string
			remark   sql.NullString
		)
		if err := relationsRows.Scan(&relID, &name, &relation, &remark); err != nil {
			relationsRows.Close()
			return nil, err
		}
		related = append(related, relatedJSON{
			ID:       relID.String, // r.id || ""
			Name:     name,
			Relation: relation,
			Remark:   nullStringToAny(remark),
		})
	}
	relationsRows.Close()
	if err := relationsRows.Err(); err != nil {
		return nil, err
	}

	tagPaths, err := s.fullTagPaths(rec.id)
	if err != nil {
		return nil, err
	}

	relationship := make([]string, 0)
	for _, p := range tagPaths {
		if strings.HasPrefix(p, "关系/") {
			segments := strings.Split(p, "/")
			relationship = append(relationship, segments[len(segments)-1])
		}
	}

	if formerNames == nil {
		formerNames = []string{}
	}
	if tagPaths == nil {
		tagPaths = []string{}
	}

	// 当前头像：avatar_hash 指向本地文件；face_uuid 仅用于「在 Immich 中浏览」等外部跳转。
	// 两者互相独立：换了 UUID 不代表头像变了，头像也可以在没有 UUID（本地上传）时存在。
	avatarHash := rec.avatarHash.String
	avatarFileName := avatarFileNames[avatarHash]

	return &contactJSON{
		ID:             rec.id,
		FaceThumbURL:   avatarURL(avatarFileName),
		FaceUUID:       rec.faceUUID.String,
		AvatarHash:     avatarHash,
		AvatarFileName: avatarFileName,
		Tag:            tagPaths,
		Name:           rec.name,
		FormerName:     formerNames,
		Gender:         rec.gender,
		Ethnicity:      rec.ethnicity.String,
		NativePlace:    rec.nativePlace.String,
		Title:          rec.title.String,
		Relationship:   relationship,
		BirthdaySolar:  rec.birthdaySolar.String,
		BirthdayLunar:  rec.birthdayLunar.String,
		Deathday:       rec.deathday.String,
		IDCard:         rec.idCard.String,
		Location:       rec.location.String,
		Address:        rec.address.String,
		Contact:        contactMethods,
		Related:        related,
		Extra:          nullStringToAny(rec.extra),
		Remark:         nullStringToAny(rec.remark),
		CreatedAt:      nullStringToAny(rec.createdAt),
		UpdatedAt:      nullStringToAny(rec.updatedAt),
	}, nil
}

// contactJSON 输出结构（字段顺序与 Node 版 res.json 的键序一致）。
type contactJSON struct {
	ID           string `json:"id"`
	FaceThumbURL string `json:"face_thumb_url"`
	FaceUUID     string `json:"face_uuid"`
	// AvatarHash 当前头像的内容哈希（本地头像文件去重与历史切换的标识）
	AvatarHash string `json:"avatar_hash"`
	// AvatarFileName 当前头像的落盘文件名（<hash><ext>）
	AvatarFileName string            `json:"avatar_file_name"`
	Tag            []string          `json:"tag"`
	Name           string            `json:"name"`
	FormerName     []string          `json:"former_name"`
	Gender         any               `json:"gender"`
	Ethnicity      string            `json:"ethnicity"`
	NativePlace    string            `json:"native_place"`
	Title          string            `json:"title"`
	Relationship   []string          `json:"relationship"`
	BirthdaySolar  string            `json:"birthday_solar"`
	BirthdayLunar  string            `json:"birthday_lunar"`
	Deathday       string            `json:"deathday"`
	IDCard         string            `json:"id_card"`
	Location       string            `json:"location"`
	Address        string            `json:"address"`
	Contact        map[string]string `json:"contact"`
	Related        []relatedJSON     `json:"related"`
	Extra          any               `json:"extra"`
	Remark         any               `json:"remark"`
	CreatedAt      any               `json:"created_at"`
	UpdatedAt      any               `json:"updated_at"`
}

type relatedJSON struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Relation string `json:"relation"`
	Remark   any    `json:"remark"`
}

// ==========================================
// 差异比对快照
// ==========================================

type snapshotRelated struct {
	ID       string
	Name     string
	Relation string
	Remark   string
}

type contactSnapshot struct {
	FaceUUID      string
	Name          string
	Gender        string
	Ethnicity     string
	NativePlace   string
	Title         string
	BirthdaySolar string
	BirthdayLunar string
	Deathday      string
	IDCard        string
	Location      string
	Address       string
	Extra         string
	Remark        string
	FormerName    []string
	Contact       map[string]string
	Related       []snapshotRelated
	Tag           []string
}

// buildOldSnapshot 规范化老数据结构。
func buildOldSnapshot(rec *contactRecord, formerNames []string, methods []contactMethodRow, relations []oldRelationRow, tagPaths []string) contactSnapshot {
	oldMethods := map[string]string{}
	for _, m := range methods {
		if strings.TrimSpace(m.value) != "" {
			oldMethods[m.typ] = m.value
		}
	}

	related := make([]snapshotRelated, 0, len(relations))
	for _, r := range relations {
		related = append(related, snapshotRelated{
			ID:       r.relatedContactID.String, // r.id || ""
			Name:     r.name,
			Relation: r.relation,
			Remark:   r.remark.String, // r.remark || ""
		})
	}

	if formerNames == nil {
		formerNames = []string{}
	}
	if tagPaths == nil {
		tagPaths = []string{}
	}

	return contactSnapshot{
		FaceUUID:      rec.faceUUID.String,
		Name:          rec.name,
		Gender:        dbStringOrEmpty(rec.gender),
		Ethnicity:     rec.ethnicity.String,
		NativePlace:   rec.nativePlace.String,
		Title:         rec.title.String,
		BirthdaySolar: rec.birthdaySolar.String,
		BirthdayLunar: rec.birthdayLunar.String,
		Deathday:      rec.deathday.String,
		IDCard:        rec.idCard.String,
		Location:      rec.location.String,
		Address:       rec.address.String,
		Extra:         rec.extra.String,
		Remark:        rec.remark.String,
		FormerName:    formerNames,
		Contact:       oldMethods,
		Related:       related,
		Tag:           tagPaths,
	}
}

// buildNewSnapshot 规范化前端传来的新数据结构
// （补齐缺省值，防止因空字段误判为变动）。
func buildNewSnapshot(data *saveContactPayload) contactSnapshot {
	former := make([]string, 0, len(data.FormerName))
	for _, v := range data.FormerName {
		if web.Truthy(v) {
			former = append(former, web.JSString(v))
		}
	}

	newMethods := map[string]string{}
	for typ, v := range data.Contact {
		typ = strings.TrimSpace(typ)
		val := strings.TrimSpace(web.JSStringOrEmpty(v))
		if typ == "" || val == "" {
			continue
		}
		newMethods[typ] = val
	}

	related := make([]snapshotRelated, 0, len(data.Related))
	for _, r := range data.Related {
		id := r.ID
		if id == "" {
			id = r.ContactID // r.id || r.contactId || ""
		}
		related = append(related, snapshotRelated{
			ID:       id,
			Name:     r.Name,
			Relation: r.Relation,
			Remark:   r.Remark,
		})
	}

	tags := make([]string, 0, len(data.Tag))
	for _, t := range data.Tag {
		if web.Truthy(t) {
			tags = append(tags, strings.TrimSpace(web.JSString(t)))
		}
	}

	return contactSnapshot{
		FaceUUID:      data.FaceUUID,
		Name:          data.Name,
		Gender:        genderString(data.Gender),
		Ethnicity:     data.Ethnicity,
		NativePlace:   data.NativePlace,
		Title:         data.Title,
		BirthdaySolar: data.BirthdaySolar,
		BirthdayLunar: data.BirthdayLunar,
		Deathday:      data.Deathday,
		IDCard:        data.IDCard,
		Location:      data.Location,
		Address:       data.Address,
		Extra:         data.Extra,
		Remark:        data.Remark,
		FormerName:    former,
		Contact:       newMethods,
		Related:       related,
		Tag:           tags,
	}
}

// ==========================================
// 值转换辅助
// ==========================================

// genderValue 将请求中的 gender 转为 SQL 绑定值（数字整数化、null 归 NULL）。
func genderValue(raw json.RawMessage) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		if f == math.Trunc(f) && math.Abs(f) < 1e15 {
			return int64(f)
		}
		return f
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	return nil
}

// genderString 复刻 `gender !== null && !== undefined ? String(gender) : ""`。
func genderString(raw json.RawMessage) string {
	v := genderValue(raw)
	if v == nil {
		return ""
	}
	return web.JSString(v)
}

// dbStringOrEmpty 将数据库任意值按 JS String() 语义转换（nil 归空串）。
func dbStringOrEmpty(v any) string {
	if v == nil {
		return ""
	}
	return web.JSString(v)
}

// nilIfEmpty 空字符串归 NULL（对齐 `data.x || null`）。
func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// nullStringToAny 保留 NULL 语义输出 JSON null。
func nullStringToAny(ns sql.NullString) any {
	if !ns.Valid {
		return nil
	}
	return ns.String
}

// randomContactID 等价 Math.random().toString(36).substring(2, 11).toUpperCase()：
// 9 位大写 base36 随机串。
func randomContactID() string {
	const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, 9)
	for i := range b {
		b[i] = charset[rand.IntN(len(charset))]
	}
	return string(b)
}
