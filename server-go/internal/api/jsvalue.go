package api

// JS 语义的请求值转换辅助：排序接口的 id 数组元素可能来自 JSON 的
// 数字或字符串，绑定时对齐 node-sqlite3 的行为（整数绑 INTEGER）。

import (
	"encoding/json"
	"math"
)

// jsSQLValue 将 JSON 反序列化出的值转为 SQL 绑定值：
// 整数型 float64 绑定为 int64，其余原样透传。
func jsSQLValue(v any) any {
	switch t := v.(type) {
	case float64:
		if t == math.Trunc(t) && !math.IsInf(t, 0) {
			return int64(t)
		}
		return t
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return i
		}
		if f, err := t.Float64(); err == nil {
			return f
		}
		return t.String()
	default:
		return v
	}
}
