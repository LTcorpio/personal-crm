package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"crm-server/internal/config"
)

// immichTimeout 单张人脸缩略图的抓取超时。
const immichTimeout = 8 * time.Second

// errImmichNotConfigured Immich 地址或 API Key 缺失。
var errImmichNotConfigured = errors.New("未配置 IMMICH_BASE_URL / IMMICH_API_KEY，无法从 Immich 获取头像")

// fetchImmichThumbnail 按 Immich 人物 UUID 抓取人脸缩略图原始字节。
// 返回 (图片字节, 响应 Content-Type, 错误)。
func fetchImmichThumbnail(ctx context.Context, faceUUID string) ([]byte, string, error) {
	if !config.ImmichConfigured() {
		return nil, "", errImmichNotConfigured
	}

	// UUID 直接拼进路径前做一次转义，避免特殊字符改变请求路径
	target := fmt.Sprintf("%s/api/people/%s/thumbnail", config.ImmichBaseURL, url.PathEscape(faceUUID))

	ctx, cancel := context.WithTimeout(ctx, immichTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("x-api-key", config.ImmichAPIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, "", fmt.Errorf("Immich 返回 %s", resp.Status)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 {
		return nil, "", errors.New("Immich 返回了空图片")
	}
	return data, resp.Header.Get("Content-Type"), nil
}
