package api

// ==========================================
// 9. Immich 缩略图实时代理（对应 contactController.js 的 proxyFaceImage）
//
// 头像本地化之后，本接口只承担一个窄用途：
// 在「新建联系人、还没保存」时，让表单能立刻预览刚填进去的 face_uuid 长什么样。
// 已保存联系人的头像展示一律走本地文件 /api/avatars/<file>，不再实时依赖 Immich。
// ==========================================

import (
	"errors"
	"net/http"
	"strings"
)

// handleProxyFace 实时代理 Immich 人脸缩略图。
func (s *Server) handleProxyFace(w http.ResponseWriter, r *http.Request) {
	uuid := strings.TrimSpace(r.PathValue("uuid"))
	if uuid == "" {
		writeFaceNotFound(w, uuid, errors.New("缺少人脸 UUID"))
		return
	}

	data, contentType, err := fetchImmichThumbnail(r.Context(), uuid)
	if err != nil {
		writeFaceNotFound(w, uuid, err)
		return
	}
	if contentType == "" {
		contentType = "image/jpeg"
	}
	w.Header().Set("Content-Type", contentType)
	// 未保存的 UUID 预览不必长期缓存，避免刚在 Immich 换图后前端仍显示旧图
	w.Header().Set("Cache-Control", "private, max-age=60")
	_, _ = w.Write(data)
}

// writeFaceNotFound 与 Node 版一致：记录错误并返回 404 纯文本。
func writeFaceNotFound(w http.ResponseWriter, uuid string, err error) {
	logServerError("无法获取人脸图片 ["+uuid+"]:", err)
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte("图片未找到或 Immich 服务未响应"))
}
