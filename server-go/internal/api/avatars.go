package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"crm-server/internal/avatar"
	"crm-server/internal/config"
	"crm-server/internal/web"
)

// ==========================================
// 10. 联系人头像：本地化存储与历史管理
//
// 设计要点：
//   - 头像图片落在 $AVATAR_DIR（默认 $DB_DIR/avatars），与 SQLite 库同盘同目录，
//     外部备份服务按目录整体拷贝时自动覆盖；展示不再实时依赖 Immich。
//   - Immich 的 face_uuid 仍然保留在 contacts 表上，负责「右键 → 在 Immich 中浏览」跳转。
//   - contact_avatars 记录某位联系人历史上用过的每一张不同图片（按内容哈希去重），
//     支持回看、回切为当前、删除；磁盘文件全局按哈希去重，无引用时才真正删除。
// ==========================================

// avatarPerImageLimit 单张图片（方图或原图）的体积上限。
const avatarPerImageLimit = 20 << 20 // 20MB

// avatarUploadLimit 单次上传请求的总体积上限。
// 一次上传可能同时带「裁剪后的方图」与「裁剪前的原图」，因此在单张上限之外留出余量。
const avatarUploadLimit = avatarPerImageLimit + (6 << 20) // 26MB

// avatarSyncConcurrency 批量回填头像时的并发抓取数。
const avatarSyncConcurrency = 4

// avatarSourceImmich / avatarSourceUpload 头像来源标记。
const (
	avatarSourceImmich = "immich"
	avatarSourceUpload = "upload"
)

// avatarJSON 单条历史头像的输出结构。
type avatarJSON struct {
	Hash      string `json:"hash"`
	FileName  string `json:"file_name"`
	URL       string `json:"url"`
	FaceUUID  string `json:"face_uuid"`
	Source    string `json:"source"`
	IsCurrent bool   `json:"is_current"`
	CreatedAt any    `json:"created_at"`
	// OriginalURL 裁剪前的原图地址（仅上传来源且确实带原图时有值）
	OriginalURL string `json:"original_url"`
	// OriginalFileName 原图的落盘文件名（前端「重新裁剪」时用来取回原图字节）
	OriginalFileName string `json:"original_file_name"`
}

// avatarURL 生成头像的对外访问路径（相对路径，由前端按部署环境拼接主机前缀）。
func avatarURL(fileName string) string {
	if fileName == "" {
		return ""
	}
	return "/api/avatars/" + fileName
}

// errContactNotFound 联系人不存在。
var errContactNotFound = errors.New("联系人不存在")

// ==========================================
// 10.1 本地头像文件服务
// ==========================================

// handleServeAvatar 返回本地头像文件。
// 文件名即内容哈希，因此可以放心地设置长期强缓存。
// 带 ?download=1 时改为附件下载（可用 ?filename= 指定下载名，仅用于展示，会做安全过滤）。
func (s *Server) handleServeAvatar(w http.ResponseWriter, r *http.Request) {
	fileName := r.PathValue("file")
	// 只接受形如 "<hex>.<ext>" 的裸文件名，杜绝目录穿越与隐藏文件
	if fileName == "" || fileName != filepath.Base(fileName) || strings.HasPrefix(fileName, ".") {
		http.NotFound(w, r)
		return
	}
	info, err := os.Stat(s.avatars.Path(fileName))
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", attachmentDisposition(r.URL.Query().Get("filename"), fileName))
	}
	http.ServeFile(w, r, s.avatars.Path(fileName))
}

// attachmentDisposition 组装附件下载响应头。
// 同时给出 ASCII 回退名与 RFC 5987 的 UTF-8 名（中文文件名也能正确落盘），
// 并剔除引号、反斜杠、控制字符等可能造成响应头注入的字符。
func attachmentDisposition(name, fallback string) string {
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || r == 0x7f || r == '"' || r == '\\' || r == '/' || r == ':' {
			continue
		}
		b.WriteRune(r)
	}
	clean := strings.TrimSpace(b.String())
	if clean == "" {
		clean = fallback
	}
	if runes := []rune(clean); len(runes) > 80 {
		clean = string(runes[:80])
	}
	ascii := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, clean)
	return `attachment; filename="` + ascii + `"; filename*=UTF-8''` + url.PathEscape(clean)
}

// ==========================================
// 10.2 历史头像列表 / 设为当前 / 删除
// ==========================================

// handleListContactAvatars 返回某位联系人的全部历史头像（最新在前）。
func (s *Server) handleListContactAvatars(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")

	current, err := s.currentAvatarHash(contactID)
	if err != nil {
		writeAvatarError(w, err)
		return
	}

	rows, err := s.crm.Query(`
        SELECT hash, file_name, face_uuid, source, created_at, original_file_name
        FROM contact_avatars
        WHERE contact_id = ?
        ORDER BY created_at DESC, id DESC
    `, contactID)
	if err != nil {
		logServerError("获取历史头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "获取历史头像失败"})
		return
	}
	defer rows.Close()

	list := make([]avatarJSON, 0)
	for rows.Next() {
		var (
			hash       string
			fileName   string
			faceUUID   sql.NullString
			source     string
			createdAt  sql.NullString
			originalFN sql.NullString
		)
		if err := rows.Scan(&hash, &fileName, &faceUUID, &source, &createdAt, &originalFN); err != nil {
			logServerError("获取历史头像失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "获取历史头像失败"})
			return
		}
		list = append(list, avatarJSON{
			Hash:             hash,
			FileName:         fileName,
			URL:              avatarURL(fileName),
			FaceUUID:         faceUUID.String,
			Source:           source,
			IsCurrent:        hash == current,
			CreatedAt:        nullStringToAny(createdAt),
			OriginalURL:      avatarURL(originalFN.String),
			OriginalFileName: originalFN.String,
		})
	}
	if err := rows.Err(); err != nil {
		logServerError("获取历史头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "获取历史头像失败"})
		return
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"current": current,
		"avatars": list,
	})
}

// handleSetContactAvatar 把历史中的某一张设为当前头像。
func (s *Server) handleSetContactAvatar(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")

	var body struct {
		Hash string `json:"hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	hash := strings.TrimSpace(body.Hash)
	if hash == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "缺少头像哈希"})
		return
	}

	// 只能切换到该联系人自己的历史头像
	var fileName string
	err := s.crm.QueryRow(`SELECT file_name FROM contact_avatars WHERE contact_id = ? AND hash = ?`, contactID, hash).Scan(&fileName)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		web.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "该头像不在这位联系人的历史记录中"})
		return
	case err != nil:
		logServerError("设置当前头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "设置当前头像失败"})
		return
	}

	if _, err := s.crm.Exec(`UPDATE contacts SET avatar_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, hash, contactID); err != nil {
		logServerError("设置当前头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "设置当前头像失败"})
		return
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "已切换为历史头像",
		"hash":    hash,
		"url":     avatarURL(fileName),
	})
}

// handleDeleteContactAvatar 删除一条历史头像。
// 当前正在使用的头像不允许删除（须先切换到其它头像）；
// 物理文件仅当全局再无任何引用时才从磁盘移除。
func (s *Server) handleDeleteContactAvatar(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")
	hash := r.PathValue("hash")

	current, err := s.currentAvatarHash(contactID)
	if err != nil {
		writeAvatarError(w, err)
		return
	}
	if hash == current {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "当前正在使用的头像不能删除，请先切换为其它头像"})
		return
	}

	var (
		fileName string
		origHash sql.NullString
		origName sql.NullString
	)
	err = s.crm.QueryRow(`
        SELECT file_name, original_hash, original_file_name
        FROM contact_avatars WHERE contact_id = ? AND hash = ?
    `, contactID, hash).Scan(&fileName, &origHash, &origName)
	if errors.Is(err, sql.ErrNoRows) {
		web.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": "历史头像不存在"})
		return
	}
	if err != nil {
		logServerError("删除历史头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "删除历史头像失败"})
		return
	}

	if _, err := s.crm.Exec(`DELETE FROM contact_avatars WHERE contact_id = ? AND hash = ?`, contactID, hash); err != nil {
		logServerError("删除历史头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "删除历史头像失败"})
		return
	}

	s.gcAvatarFile(hash, fileName)
	// 方图删掉后，它带的原图也一并回收（若别处仍在引用则会保留）
	if origHash.Valid && origHash.String != "" {
		s.gcAvatarFile(origHash.String, origName.String)
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "历史头像已删除"})
}

// ==========================================
// 10.3 从 Immich 抓取 / 本地上传
// ==========================================

// handleFetchContactAvatar 从 Immich 重新抓取该联系人当前 face_uuid 对应的头像，
// 落盘后追加（或命中）历史，并设为当前头像。
// 请求体可选传 {"face_uuid": "..."}：用于「表单里改了 UUID 但还没保存」时按新 UUID 预览拉取。
func (s *Server) handleFetchContactAvatar(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")

	var body struct {
		FaceUUID string `json:"face_uuid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	var storedFace sql.NullString
	err := s.crm.QueryRow(`SELECT face_uuid FROM contacts WHERE id = ?`, contactID).Scan(&storedFace)
	if errors.Is(err, sql.ErrNoRows) {
		writeAvatarError(w, errContactNotFound)
		return
	}
	if err != nil {
		logServerError("获取联系人失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "获取联系人失败"})
		return
	}

	faceUUID := strings.TrimSpace(body.FaceUUID)
	if faceUUID == "" {
		faceUUID = storedFace.String
	}
	if faceUUID == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "该联系人尚未绑定 Immich 人脸 UUID"})
		return
	}

	// 先抓图，成功后再动数据库：抓取失败时联系人资料保持原样，不留半更新状态
	data, _, err := fetchImmichThumbnail(r.Context(), faceUUID)
	if err != nil {
		log.Printf("从 Immich 获取头像失败 [%s/%s]: %v", contactID, faceUUID, err)
		web.WriteJSON(w, http.StatusBadGateway, map[string]any{
			"success": false,
			"message": "从 Immich 获取头像失败：" + err.Error(),
		})
		return
	}

	// 显式指定了 UUID 时一并落库：用户点了「从 Immich 获取」就表示认这个 UUID，
	// 让库里的 face_uuid 与刚落盘的头像保持同源，避免出现「头像是新人的、UUID 还是旧人」。
	if faceUUID != storedFace.String {
		if _, err := s.crm.Exec(`UPDATE contacts SET face_uuid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, faceUUID, contactID); err != nil {
			logServerError("更新人脸 UUID 失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "更新人脸 UUID 失败"})
			return
		}
	}

	item, err := s.recordAvatar(recordAvatarInput{
		ContactID:  contactID,
		Data:       data,
		FaceUUID:   faceUUID,
		Source:     avatarSourceImmich,
		SetCurrent: true,
	})
	if err != nil {
		logServerError("保存头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "保存头像失败"})
		return
	}

	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "头像已更新", "avatar": item})
}

// handleUploadContactAvatar 上传本地图片作为头像。
//
// 请求可带两个文件字段：
//   - file（必填）：前端裁剪后的正方形图，作为展示用头像；
//   - original（可选）：裁剪前的原图，原样存档，供历史里「查看 / 下载原图」与「重新裁剪」。
//
// 另有布尔字段 original_is_file：为真时表示「未裁剪，方图就是原图」，
// 直接把 file 认作原图，省掉同一份字节的重复上传。
//
// 两者都按内容哈希落盘，同一张图全库只存一份。
func (s *Server) handleUploadContactAvatar(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")

	if _, err := s.currentAvatarHash(contactID); err != nil {
		writeAvatarError(w, err)
		return
	}

	// 内层再收一次体积上限（外层 bodyLimit 是 50MB 的全局兜底）。
	// 额外留 1MB 余量给 multipart 边界与表单头，避免刚好卡在上限的图片被误判超限。
	r.Body = http.MaxBytesReader(w, r.Body, avatarUploadLimit+(1<<20))
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			web.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "message": "图片体积超过 20MB 上限"})
			return
		}
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "上传内容解析失败"})
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	cropHeader := avatarFormFile(r.MultipartForm, "file", "avatar")
	if cropHeader == nil {
		cropHeader = avatarFirstFile(r.MultipartForm)
	}
	if cropHeader == nil {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "未收到上传文件"})
		return
	}
	if cropHeader.Size > avatarPerImageLimit {
		web.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "message": "图片体积超过 20MB 上限"})
		return
	}

	cropData, err := readUploadFile(cropHeader)
	if err != nil {
		logServerError("读取上传头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "读取上传图片失败"})
		return
	}
	if len(cropData) == 0 {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "上传的图片为空"})
		return
	}

	// 原图（可选）
	var originalData []byte
	var originalName string
	if formFlagSet(r.MultipartForm, "original_is_file") {
		// 「不裁剪，直接用原图」路径：方图与原图本就是同一份内容，
		// 前端无需把同一份字节传两遍，这里直接复用已读入的方图数据。
		originalData = cropData
		originalName = cropHeader.Filename
	} else if origHeader := avatarFormFile(r.MultipartForm, "original"); origHeader != nil && origHeader.Size > 0 {
		if origHeader.Size > avatarPerImageLimit {
			web.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "message": "原图体积超过 20MB 上限"})
			return
		}
		originalData, err = readUploadFile(origHeader)
		if err != nil {
			logServerError("读取上传原图失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "读取上传原图失败"})
			return
		}
		originalName = origHeader.Filename
	}

	// 两个文件先一起校验格式，避免「原图不合格但方图已经写进磁盘」这类半保存
	for _, data := range [][]byte{cropData, originalData} {
		if len(data) == 0 {
			continue
		}
		if err := avatar.Validate(data); err != nil {
			web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": err.Error()})
			return
		}
	}

	item, err := s.recordAvatar(recordAvatarInput{
		ContactID:    contactID,
		Data:         cropData,
		OriginalData: originalData,
		Source:       avatarSourceUpload,
		SetCurrent:   true,
	})
	if err != nil {
		logServerError("保存上传头像失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "保存上传头像失败"})
		return
	}

	if originalName != "" {
		log.Printf("[头像] 已为联系人 %s 保存上传头像 %s（含原图 %s）", contactID, item.FileName, originalName)
	} else {
		log.Printf("[头像] 已为联系人 %s 保存上传头像 %s（原始文件名：%s）", contactID, item.FileName, cropHeader.Filename)
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "头像已上传", "avatar": item})
}

// avatarFormFile 按字段名取 multipart 文件，找不到返回 nil（用于 original 这类可选字段）。
func avatarFormFile(form *multipart.Form, keys ...string) *multipart.FileHeader {
	if form == nil {
		return nil
	}
	for _, key := range keys {
		if files, ok := form.File[key]; ok && len(files) > 0 {
			return files[0]
		}
	}
	return nil
}

// formFlagSet 判断 multipart 普通字段是否为真值（1 / true / on / yes）。
func formFlagSet(form *multipart.Form, key string) bool {
	if form == nil {
		return false
	}
	values, ok := form.Value[key]
	if !ok || len(values) == 0 {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(values[0])) {
	case "1", "true", "on", "yes":
		return true
	}
	return false
}

// avatarFirstFile 兜底：取表单里的第一个文件（兼容只传 file/avatar 之外的字段名）。
func avatarFirstFile(form *multipart.Form) *multipart.FileHeader {
	if form == nil {
		return nil
	}
	for _, files := range form.File {
		if len(files) > 0 {
			return files[0]
		}
	}
	return nil
}

// readUploadFile 读取一个已解析出的上传文件内容。
func readUploadFile(header *multipart.FileHeader) ([]byte, error) {
	f, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}

// ==========================================
// 10.4 批量回填（启动自动执行 + 前端手动触发）
// ==========================================

// avatarSyncResult 批量回填的统计结果。
type avatarSyncResult struct {
	Total   int      `json:"total"`
	Fetched int      `json:"fetched"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors"`
}

// handleSyncAvatars 手动触发一次全量回填：把所有「已绑定 face_uuid 但本地还没有对应头像」
// 的联系人补齐到本地。
func (s *Server) handleSyncAvatars(w http.ResponseWriter, r *http.Request) {
	result := s.SyncAllAvatars(r.Context())
	web.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": syncMessage(result),
		"result":  result,
	})
}

func syncMessage(r avatarSyncResult) string {
	if r.Total == 0 {
		return "所有已绑定 Immich 头像的联系人本地均已有图，无需同步"
	}
	if r.Failed == 0 {
		return "头像同步完成"
	}
	return "头像同步完成（存在失败项，详见返回明细）"
}

// SyncAllAvatars 把所有「已绑定 face_uuid 但本地缺图」的联系人头像抓取到本地。
// 用于服务启动时自动补全存量数据，以及前端「同步全部头像」按钮。
func (s *Server) SyncAllAvatars(ctx context.Context) avatarSyncResult {
	result := avatarSyncResult{Errors: []string{}}

	if !config.ImmichConfigured() {
		result.Errors = append(result.Errors, errImmichNotConfigured.Error())
		return result
	}

	type target struct {
		contactID string
		faceUUID  string
	}

	// 本地已有「当前 face_uuid 对应的 immich 来源头像」的联系人直接跳过，
	// 因此重复执行同步不会产生多余的网络请求与历史记录。
	rows, err := s.crm.Query(`
        SELECT c.id, c.face_uuid
        FROM contacts c
        WHERE c.face_uuid IS NOT NULL AND TRIM(c.face_uuid) <> ''
          AND NOT EXISTS (
              SELECT 1 FROM contact_avatars a
              WHERE a.contact_id = c.id
                AND a.source = ?
                AND a.face_uuid = c.face_uuid
          )
        ORDER BY c.sort_order ASC
    `, avatarSourceImmich)
	if err != nil {
		result.Errors = append(result.Errors, "查询待同步联系人失败: "+err.Error())
		logServerError("同步头像失败:", err)
		return result
	}

	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.contactID, &t.faceUUID); err != nil {
			rows.Close()
			result.Errors = append(result.Errors, "读取待同步联系人失败: "+err.Error())
			return result
		}
		targets = append(targets, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		result.Errors = append(result.Errors, "读取待同步联系人失败: "+err.Error())
		return result
	}

	result.Total = len(targets)
	if result.Total == 0 {
		return result
	}

	var (
		mu       sync.Mutex
		wg       sync.WaitGroup
		sem      = make(chan struct{}, avatarSyncConcurrency)
		failures []string
		fetched  int
	)

	cancelled := false
	for _, t := range targets {
		select {
		case <-ctx.Done():
			cancelled = true
		case sem <- struct{}{}:
		}
		if cancelled {
			break
		}

		wg.Add(1)
		go func(t target) {
			defer wg.Done()
			defer func() { <-sem }()

			data, _, err := fetchImmichThumbnail(ctx, t.faceUUID)
			if err == nil {
				// SetCurrent=false：仅在联系人当前没有头像时才接上，
				// 避免批量同步覆盖用户手动选定的历史头像。
				_, err = s.recordAvatar(recordAvatarInput{
					ContactID:  t.contactID,
					Data:       data,
					FaceUUID:   t.faceUUID,
					Source:     avatarSourceImmich,
					SetCurrent: false,
				})
			}

			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failures = append(failures, t.contactID+": "+err.Error())
				return
			}
			fetched++
		}(t)
	}
	wg.Wait()

	mu.Lock()
	result.Fetched = fetched
	result.Failed = len(failures)
	result.Errors = append(result.Errors, failures...)
	mu.Unlock()

	if cancelled {
		result.Errors = append(result.Errors, "同步已被取消，剩余联系人未处理")
	}
	return result
}

// BackfillAvatarsOnStartup 服务启动后的后台存量头像补全。
func (s *Server) BackfillAvatarsOnStartup(ctx context.Context) {
	if !config.ImmichConfigured() {
		log.Println("[头像] 未配置 IMMICH_API_KEY，跳过启动时的头像本地化补全")
		return
	}
	s.avatars.CleanTempFiles()

	result := s.SyncAllAvatars(ctx)
	if result.Total == 0 {
		log.Println("[头像] 本地头像已是最新，无需补全")
		return
	}
	log.Printf("[头像] 启动补全完成：待处理 %d，成功 %d，失败 %d", result.Total, result.Fetched, result.Failed)
	for _, e := range result.Errors {
		log.Printf("[头像] 补全失败明细: %s", e)
	}
}

// ==========================================
// 10.5 内部公共逻辑
// ==========================================

// currentAvatarHash 读取联系人当前的 avatar_hash；联系人不存在时返回 errContactNotFound。
func (s *Server) currentAvatarHash(contactID string) (string, error) {
	var hash sql.NullString
	err := s.crm.QueryRow(`SELECT avatar_hash FROM contacts WHERE id = ?`, contactID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errContactNotFound
	}
	if err != nil {
		return "", err
	}
	return hash.String, nil
}

// recordAvatarInput 一次头像入库请求。
type recordAvatarInput struct {
	ContactID string
	Data      []byte
	// OriginalData 裁剪前的原图（可选，仅本地上传路径会带），原样存档
	OriginalData []byte
	FaceUUID     string // 上传来源留空
	Source       string
	SetCurrent   bool // true 无条件设为当前；false 仅在当前为空时接上
}

// recordAvatar 把图片按内容哈希落盘，写入（或命中）该联系人的历史头像，
// 并按需把它设为当前头像。返回落库后的历史条目。
func (s *Server) recordAvatar(in recordAvatarInput) (*avatarJSON, error) {
	saved, err := s.avatars.Save(in.Data)
	if err != nil {
		return nil, err
	}

	var (
		originalHash sql.NullString
		originalName sql.NullString
		// prevOriginal 该条历史此前的原图文件名，用于换了原图后回收旧文件
		prevOriginal sql.NullString
	)
	if len(in.OriginalData) > 0 {
		orig, err := s.avatars.Save(in.OriginalData)
		if err != nil {
			return nil, err
		}
		originalHash = sql.NullString{String: orig.Hash, Valid: true}
		originalName = sql.NullString{String: orig.FileName, Valid: true}
		_ = s.crm.QueryRow(
			`SELECT original_file_name FROM contact_avatars WHERE contact_id = ? AND hash = ?`,
			in.ContactID, saved.Hash,
		).Scan(&prevOriginal)
	}

	// 同一位联系人重复使用同一张图时只保留一条历史
	if _, err := s.crm.Exec(`
        INSERT INTO contact_avatars (contact_id, hash, file_name, face_uuid, source, original_hash, original_file_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(contact_id, hash) DO NOTHING
    `, in.ContactID, saved.Hash, saved.FileName, nilIfEmpty(in.FaceUUID), in.Source, originalHash, originalName); err != nil {
		return nil, err
	}

	// 命中去重（这张方图此前已用过）时上面的 INSERT 不生效；
	// 此时若这次带了原图，就补写原图信息，避免用户重新上传同一张方图却看不到原图入口。
	if len(in.OriginalData) > 0 {
		if _, err := s.crm.Exec(`
            UPDATE contact_avatars
            SET original_hash = ?, original_file_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE contact_id = ? AND hash = ?
        `, originalHash, originalName, in.ContactID, saved.Hash); err != nil {
			return nil, err
		}
		if prevOriginal.Valid && prevOriginal.String != "" && prevOriginal.String != originalName.String {
			s.gcAvatarFile(strings.TrimSuffix(prevOriginal.String, filepath.Ext(prevOriginal.String)), prevOriginal.String)
		}
	}

	shouldSetCurrent := in.SetCurrent
	if !shouldSetCurrent {
		current, err := s.currentAvatarHash(in.ContactID)
		if err != nil {
			return nil, err
		}
		shouldSetCurrent = current == ""
	}
	if shouldSetCurrent {
		if _, err := s.crm.Exec(
			`UPDATE contacts SET avatar_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			saved.Hash, in.ContactID,
		); err != nil {
			return nil, err
		}
	}

	var (
		faceUUID   sql.NullString
		source     string
		createdAt  sql.NullString
		storedOrig sql.NullString
	)
	if err := s.crm.QueryRow(`
        SELECT face_uuid, source, created_at, original_file_name FROM contact_avatars
        WHERE contact_id = ? AND hash = ?
    `, in.ContactID, saved.Hash).Scan(&faceUUID, &source, &createdAt, &storedOrig); err != nil {
		return nil, err
	}

	return &avatarJSON{
		Hash:             saved.Hash,
		FileName:         saved.FileName,
		URL:              avatarURL(saved.FileName),
		FaceUUID:         faceUUID.String,
		Source:           source,
		IsCurrent:        shouldSetCurrent,
		CreatedAt:        nullStringToAny(createdAt),
		OriginalURL:      avatarURL(storedOrig.String),
		OriginalFileName: storedOrig.String,
	}, nil
}

// gcAvatarFile 回收头像文件：仅当该哈希在 contact_avatars 中已无任何引用时才删除磁盘文件。
func (s *Server) gcAvatarFile(hash, fileName string) {
	if strings.TrimSpace(hash) == "" || strings.TrimSpace(fileName) == "" {
		return
	}
	var refs int
	if err := s.crm.QueryRow(
		`SELECT COUNT(*) FROM contact_avatars WHERE hash = ? OR original_hash = ?`, hash, hash,
	).Scan(&refs); err != nil {
		logServerError("统计头像引用失败:", err)
		return
	}
	if refs > 0 {
		return
	}
	// 文件可能已被同一批回收中的前一次调用删掉，这里先确认存在再删，
	// 避免日志里出现「回收了 7 个」但实际只有 4 个文件的噪声。
	if _, err := os.Stat(s.avatars.Path(fileName)); err != nil {
		return
	}
	if err := s.avatars.Delete(fileName); err != nil {
		logServerError("删除头像文件失败:", err)
		return
	}
	log.Printf("[头像] 已回收无引用文件 %s", fileName)
}

// loadAvatarFileNames 一次性取出「哈希 → 落盘文件名」映射，
// 供列表接口批量组装 face_thumb_url，避免逐个联系人查询。
func (s *Server) loadAvatarFileNames() map[string]string {
	result := make(map[string]string)
	rows, err := s.crm.Query(`SELECT hash, file_name FROM contact_avatars GROUP BY hash`)
	if err != nil {
		logServerError("加载头像文件名失败:", err)
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var hash, fileName string
		if err := rows.Scan(&hash, &fileName); err != nil {
			return result
		}
		result[hash] = fileName
	}
	return result
}

// writeAvatarError 统一处理头像接口中的「联系人不存在」等通用错误。
func writeAvatarError(w http.ResponseWriter, err error) {
	if errors.Is(err, errContactNotFound) {
		web.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "message": errContactNotFound.Error()})
		return
	}
	logServerError("头像操作失败:", err)
	web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "头像操作失败"})
}
