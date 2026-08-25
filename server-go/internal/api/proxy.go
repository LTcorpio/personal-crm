package api

// ==========================================
// 9. Immich 缩略图网络代理
// （对应 contactController.js 的 proxyFaceImage）
// ==========================================

import (
	"io"
	"net/http"
	"os"
)

// immichProxy 代理 Immich 人脸缩略图请求。
func (s *Server) handleProxyFace(w http.ResponseWriter, r *http.Request) {
	uuid := r.PathValue("uuid")
	immichURL := os.Getenv("IMMICH_BASE_URL") + "/api/people/" + uuid + "/thumbnail"

	writeNotFound := func(err error) {
		// 与 Node 版一致：记录错误并返回 404 纯文本
		logServerError("无法获取人脸图片 ["+uuid+"]:", err)
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("图片未找到或 Immich 服务未响应"))
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, immichURL, nil)
	if err != nil {
		writeNotFound(err)
		return
	}
	req.Header.Set("x-api-key", os.Getenv("IMMICH_API_KEY"))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeNotFound(err)
		return
	}
	defer resp.Body.Close()

	// axios 默认仅将 2xx 视为成功，其余进入错误分支
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		writeNotFound(errHTTPStatus{resp.Status})
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}
	w.Header().Set("Content-Type", contentType)
	_, _ = io.Copy(w, resp.Body)
}

// errHTTPStatus 用于日志输出的 HTTP 状态错误。
type errHTTPStatus struct {
	status string
}

func (e errHTTPStatus) Error() string {
	return "Request failed with status " + e.status
}
