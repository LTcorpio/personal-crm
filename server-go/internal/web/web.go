// Package web 提供各 handler 共用的 HTTP/JSON 响应与 JS 语义工具函数。
package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
)

// WriteJSON 按固定键序输出 JSON 响应（Content-Type 与 Express res.json 对齐），
// 并关闭 HTML 转义，使含 <、>、& 的字符串输出与 Node 版字节一致。
func WriteJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(bytes.TrimSuffix(buf.Bytes(), []byte("\n")))
}

// Truthy 复刻 JavaScript 的真值语义（用于 `x || ""`、`filter(Boolean)` 等判断）。
func Truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case float64:
		return t != 0 && !math.IsNaN(t)
	case int64:
		return t != 0
	case int:
		return t != 0
	case json.Number:
		f, err := t.Float64()
		return err == nil && f != 0
	case []any, map[string]any:
		return true // JS 中空数组/空对象为真值
	default:
		return true
	}
}

// JSString 复刻 JavaScript 的 String() 转换（用于 String(x)、模板字符串拼接）。
func JSString(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		return formatJSNumber(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case int:
		return strconv.Itoa(t)
	case json.Number:
		return t.String()
	default:
		return fmt.Sprint(v)
	}
}

// JSStringOrEmpty 复刻 `String(x || ”)`：假值归一为空字符串。
func JSStringOrEmpty(v any) string {
	if !Truthy(v) {
		return ""
	}
	return JSString(v)
}

// formatJSNumber 数值转字符串时去掉无意义的小数尾零（String(25) => "25"）。
func formatJSNumber(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}
