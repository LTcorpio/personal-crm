// Package api 组装全部 HTTP 路由，行为对齐 Node 版
// server.js（静态托管/兜底/CORS/请求体大小限制）与
// routes/contactRoutes.js、routes/rosterRoutes.js 的路由定义。
//
// 注意：系统已改由反向代理层（Authelia SSO）统一完成身份认证，
// 后端不再做任何密码/JWT 校验，完全信任代理转发过来的请求。
package api

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// jsonBodyLimit 与 Express express.json({ limit: '50mb' }) 一致。
const jsonBodyLimit = 50 << 20

// Server 聚合数据库连接。
type Server struct {
	crm       *sql.DB
	roster    *sql.DB
	staticDir string
}

// NewServer 创建 API 服务。
func NewServer(crm, roster *sql.DB, staticDir string) *Server {
	return &Server{crm: crm, roster: roster, staticDir: staticDir}
}

// Handler 构建完整的 HTTP 处理链：CORS -> 请求体限制 -> 路由。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// ===== /api 主路由（对应 contactRoutes.js）=====
	mux.HandleFunc("POST /api/contacts", s.handleSaveContact)
	mux.HandleFunc("GET /api/contacts", s.handleGetContacts)
	mux.HandleFunc("PUT /api/contacts/order", s.handleUpdateContactsOrder)
	mux.HandleFunc("DELETE /api/contacts/{id}", s.handleDeleteContact)
	mux.HandleFunc("GET /api/tags/tree", s.handleGetTagTree)
	mux.HandleFunc("PUT /api/tags/order", s.handleUpdateTagsOrder)
	mux.HandleFunc("PUT /api/tags/{id}", s.handleUpdateTag)
	mux.HandleFunc("DELETE /api/tags/{id}", s.handleDeleteTag)
	mux.HandleFunc("GET /api/topics", s.handleGetTopics)
	mux.HandleFunc("POST /api/topics", s.handleCreateTopic)
	mux.HandleFunc("PUT /api/topics/order", s.handleUpdateTopicsOrder)
	mux.HandleFunc("PUT /api/topics/{id}", s.handleUpdateTopic)
	mux.HandleFunc("DELETE /api/topics/{id}", s.handleDeleteTopic)
	mux.HandleFunc("GET /api/proxy-face/{uuid}", s.handleProxyFace)

	// ===== /api/rosters 名单路由（对应 rosterRoutes.js）=====
	mux.HandleFunc("POST /api/rosters/parse", s.handleParseRoster)
	mux.HandleFunc("POST /api/rosters", s.handleSaveRoster)
	mux.HandleFunc("GET /api/rosters", s.handleGetRosters)
	mux.HandleFunc("GET /api/rosters/search", s.handleSearchRosters)
	mux.HandleFunc("PUT /api/rosters/order", s.handleUpdateRostersOrder)
	mux.HandleFunc("GET /api/rosters/{id}/column-values", s.handleGetColumnValues)
	mux.HandleFunc("GET /api/rosters/{id}", s.handleGetRosterByID)
	mux.HandleFunc("PUT /api/rosters/{id}/name", s.handleRenameRoster)
	mux.HandleFunc("PUT /api/rosters/{id}/filterable-columns", s.handleUpdateFilterableColumns)
	mux.HandleFunc("DELETE /api/rosters/{id}", s.handleDeleteRoster)

	// ===== 静态资源 + SPA 兜底（对应 express.static + app.get catch-all）=====
	mux.HandleFunc("/", s.serveStatic)

	return corsMiddleware(bodyLimit(mux))
}

// bodyLimit 限制请求体大小（对齐 express.json 的 50mb 限制）。
func bodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, jsonBodyLimit)
		}
		next.ServeHTTP(w, r)
	})
}

// corsMiddleware 复刻 npm cors() 默认行为：
//   - 所有响应附带 Access-Control-Allow-Origin: *；
//   - 所有 OPTIONS 请求直接返回 204，并附带默认方法列表；
//   - 允许的请求头按 Access-Control-Request-Headers 反射。
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		if r.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Origin", "*")
			h.Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
			h.Add("Vary", "Access-Control-Request-Headers")
			if reqHeaders := r.Header.Get("Access-Control-Request-Headers"); reqHeaders != "" {
				h.Set("Access-Control-Allow-Headers", reqHeaders)
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.Set("Access-Control-Allow-Origin", "*")
		next.ServeHTTP(w, r)
	})
}

// serveStatic 处理前端静态资源与 SPA 兜底：
//   - 命中文件则直接返回（目录则寻找其 index.html，无尾斜杠时 301）；
//   - 未命中且为 GET/HEAD 时返回根 index.html（完美支持 React Router 刷新）；
//   - 其余方法返回 404。
func (s *Server) serveStatic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.NotFound(w, r)
		return
	}

	upath := path.Clean("/" + r.URL.Path)
	fpath := filepath.Join(s.staticDir, upath)
	isDirRequest := strings.HasSuffix(r.URL.Path, "/")

	if st, err := os.Stat(fpath); err == nil {
		if !st.IsDir() {
			if !isDirRequest {
				http.ServeFile(w, r, fpath)
				return
			}
			// 带尾斜杠访问普通文件：与 Node 版一致，交由兜底处理
		} else {
			idx := filepath.Join(fpath, "index.html")
			if st2, err2 := os.Stat(idx); err2 == nil && !st2.IsDir() {
				if !isDirRequest {
					// serve-static：目录地址缺尾斜杠时重定向
					http.Redirect(w, r, r.URL.Path+"/", http.StatusMovedPermanently)
					return
				}
				http.ServeFile(w, r, idx)
				return
			}
		}
	}

	// 兜底：返回前端 index.html
	indexPath := filepath.Join(s.staticDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, indexPath)
}

// logServerError 记录服务端错误（对应 console.error）。
func logServerError(prefix string, err error) {
	if err != nil {
		log.Printf("%s: %v", prefix, err)
	}
}
