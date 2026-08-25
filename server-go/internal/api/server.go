// Package api 组装全部 HTTP 路由，行为对齐 Node 版
// server.js（静态托管/兜底/CORS/请求体大小限制）与
// routes/contactRoutes.js、routes/rosterRoutes.js 的路由定义。
package api

import (
	"database/sql"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"crm-server/internal/auth"
)

// jsonBodyLimit 与 Express express.json({ limit: '50mb' }) 一致。
const jsonBodyLimit = 50 << 20

// Server 聚合数据库连接与认证服务。
type Server struct {
	crm       *sql.DB
	roster    *sql.DB
	auth      *auth.Service
	staticDir string
}

// NewServer 创建 API 服务。
func NewServer(crm, roster *sql.DB, authSvc *auth.Service, staticDir string) *Server {
	return &Server{crm: crm, roster: roster, auth: authSvc, staticDir: staticDir}
}

// Handler 构建完整的 HTTP 处理链：CORS -> 请求体限制 -> 路由。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// ===== /api 主路由（对应 contactRoutes.js）=====
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	// ---- 以下接口均需 JWT 鉴权（对应 router.use(authMiddleware)）----
	mux.Handle("POST /api/auth/logout", s.authed(s.handleLogout))
	mux.Handle("POST /api/settings/update", s.authed(s.handleSettingsUpdate))
	mux.Handle("POST /api/contacts", s.authed(s.handleSaveContact))
	mux.Handle("GET /api/contacts", s.authed(s.handleGetContacts))
	mux.Handle("PUT /api/contacts/order", s.authed(s.handleUpdateContactsOrder))
	mux.Handle("DELETE /api/contacts/{id}", s.authed(s.handleDeleteContact))
	mux.Handle("GET /api/tags/tree", s.authed(s.handleGetTagTree))
	mux.Handle("PUT /api/tags/order", s.authed(s.handleUpdateTagsOrder))
	mux.Handle("PUT /api/tags/{id}", s.authed(s.handleUpdateTag))
	mux.Handle("DELETE /api/tags/{id}", s.authed(s.handleDeleteTag))
	mux.Handle("GET /api/topics", s.authed(s.handleGetTopics))
	mux.Handle("POST /api/topics", s.authed(s.handleCreateTopic))
	mux.Handle("PUT /api/topics/order", s.authed(s.handleUpdateTopicsOrder))
	mux.Handle("PUT /api/topics/{id}", s.authed(s.handleUpdateTopic))
	mux.Handle("DELETE /api/topics/{id}", s.authed(s.handleDeleteTopic))
	mux.Handle("GET /api/proxy-face/{uuid}", s.authed(s.handleProxyFace))

	// ===== /api/rosters 名单路由（全部需鉴权，对应 rosterRoutes.js）=====
	mux.Handle("POST /api/rosters/parse", s.authed(s.handleParseRoster))
	mux.Handle("POST /api/rosters", s.authed(s.handleSaveRoster))
	mux.Handle("GET /api/rosters", s.authed(s.handleGetRosters))
	mux.Handle("GET /api/rosters/search", s.authed(s.handleSearchRosters))
	mux.Handle("PUT /api/rosters/order", s.authed(s.handleUpdateRostersOrder))
	mux.Handle("GET /api/rosters/{id}/column-values", s.authed(s.handleGetColumnValues))
	mux.Handle("GET /api/rosters/{id}", s.authed(s.handleGetRosterByID))
	mux.Handle("PUT /api/rosters/{id}/name", s.authed(s.handleRenameRoster))
	mux.Handle("PUT /api/rosters/{id}/filterable-columns", s.authed(s.handleUpdateFilterableColumns))
	mux.Handle("DELETE /api/rosters/{id}", s.authed(s.handleDeleteRoster))

	// ===== 静态资源 + SPA 兜底（对应 express.static + app.get catch-all）=====
	mux.HandleFunc("/", s.serveStatic)

	return corsMiddleware(bodyLimit(mux))
}

// authed 为 handler 附加 JWT 鉴权中间件。
func (s *Server) authed(h http.HandlerFunc) http.Handler {
	return s.auth.Middleware(h)
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

// clientIP 获取客户端 IP（优先 x-forwarded-for，用于穿透代理获取真实 IP）。
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	if r.RemoteAddr != "" {
		if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			return host
		}
		return r.RemoteAddr
	}
	return "未知IP"
}

// logServerError 记录服务端错误（对应 console.error）。
func logServerError(prefix string, err error) {
	if err != nil {
		log.Printf("%s: %v", prefix, err)
	}
}
