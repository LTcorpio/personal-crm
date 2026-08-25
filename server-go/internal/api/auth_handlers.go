package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"

	"crm-server/internal/auth"
	"crm-server/internal/web"
)

// handleLogin 登录验证接口（此接口不加鉴权中间件）。
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		// 与 Express 一致：请求体非法 JSON 时返回 400
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.Password == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "密码不能为空"})
		return
	}

	var stored sql.NullString
	err := s.crm.QueryRow(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`).Scan(&stored)
	if errors.Is(err, sql.ErrNoRows) {
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "系统未初始化，请稍后再试"})
		return
	}
	if err != nil {
		log.Println(err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部错误"})
		return
	}

	if auth.VerifyPassword(body.Password, stored.String) {
		token, err := s.auth.IssueToken()
		if err != nil {
			log.Println(err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部错误"})
			return
		}

		ip := clientIP(r)
		device := r.Header.Get("User-Agent")
		if device == "" {
			device = "未知设备"
		}
		if _, err := s.crm.Exec(
			`INSERT OR REPLACE INTO active_sessions (token, ip, device) VALUES (?, ?, ?)`,
			token, ip, device,
		); err != nil {
			log.Println(err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部错误"})
			return
		}
		web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "token": token})
		return
	}

	web.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "message": "密码错误，拒绝访问"})
}

// handleLogout 退出登录：吊销当前会话。
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if token := auth.BearerToken(r); token != "" {
		if _, err := s.crm.Exec(`DELETE FROM active_sessions WHERE token = ?`, token); err != nil {
			logServerError("注销会话失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器内部错误，退出失败"})
			return
		}
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "安全退出成功"})
}

// handleSettingsUpdate 修改密码和密钥（需验证旧密码）。
func (s *Server) handleSettingsUpdate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OldPassword  string `json:"oldPassword"`
		NewPassword  string `json:"newPassword"`
		NewJwtSecret string `json:"newJwtSecret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	if body.NewPassword == "" && body.NewJwtSecret == "" {
		web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "未提供任何修改项"})
		return
	}

	// 如果用户请求修改密码，先强制验证旧密码
	if body.NewPassword != "" {
		if body.OldPassword == "" {
			web.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "message": "请输入原旧密码进行身份验证"})
			return
		}

		var stored sql.NullString
		err := s.crm.QueryRow(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`).Scan(&stored)
		if errors.Is(err, sql.ErrNoRows) {
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "系统配置未完成初始化"})
			return
		}
		if err != nil {
			logServerError("更新安全设置失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器保存失败"})
			return
		}

		// 核心比对：旧密码哈希与数据库不一致则直接拒绝
		if !auth.VerifyPassword(body.OldPassword, stored.String) {
			web.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "message": "原密码输入错误，验证失败"})
			return
		}
	}

	tx, err := s.crm.Begin()
	if err != nil {
		logServerError("更新安全设置失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器保存失败"})
		return
	}
	rollback := func() { _ = tx.Rollback() }

	if body.NewPassword != "" {
		if _, err := tx.Exec(`
            INSERT OR REPLACE INTO system_settings (key, value, updated_at)
            VALUES ('crm_password_hash', ?, CURRENT_TIMESTAMP)
        `, auth.HashPassword(body.NewPassword)); err != nil {
			rollback()
			logServerError("更新安全设置失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器保存失败"})
			return
		}
	}

	if body.NewJwtSecret != "" {
		if _, err := tx.Exec(`
            INSERT OR REPLACE INTO system_settings (key, value, updated_at)
            VALUES ('jwt_secret', ?, CURRENT_TIMESTAMP)
        `, body.NewJwtSecret); err != nil {
			rollback()
			logServerError("更新安全设置失败:", err)
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器保存失败"})
			return
		}
		// 注：与 Node 版实际生效行为一致——内存中的密钥缓存不刷新，
		// 新密钥在服务重启后才会用于签发与校验。
	}

	if err := tx.Commit(); err != nil {
		rollback()
		logServerError("更新安全设置失败:", err)
		web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "服务器保存失败"})
		return
	}
	web.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "密码修改成功！"})
}

// envOr 读取环境变量（Node 版在请求时读取 process.env，此处保持一致的时机语义）。
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
