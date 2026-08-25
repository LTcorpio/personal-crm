// Package auth 实现登录凭证管理：PBKDF2 密码校验、JWT 签发与鉴权中间件
// （对应 server/middleware/auth.js 与 routes/contactRoutes.js 中的认证部分）。
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha512"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"crm-server/internal/web"
)

// tokenTTL 登录态有效期（与 Node 版 jwt.sign 的 expiresIn: '7d' 一致）
const tokenTTL = 7 * 24 * time.Hour

// fallbackSecret 数据库完全缺失密钥时的兜底值（与 auth.js 一致）
const fallbackSecret = "crm_fallback_secret_2026"

// Service 负责密钥缓存与凭证校验。
type Service struct {
	db *sql.DB

	mu           sync.RWMutex
	cachedSecret string
}

// NewService 创建认证服务。
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// Init 初始化系统配置表与默认凭证（幂等，可安全重复调用），
// 对应 middleware/auth.js 的 initSystemSettings。
func (s *Service) Init() error {
	if _, err := s.db.Exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `); err != nil {
		return err
	}
	if _, err := s.db.Exec(`
        CREATE TABLE IF NOT EXISTS active_sessions (
            token TEXT PRIMARY KEY,
            ip TEXT,
            device TEXT,
            logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `); err != nil {
		return err
	}

	// 清理 7 天以前的过期残留会话
	if _, err := s.db.Exec(`DELETE FROM active_sessions WHERE logged_in_at < datetime('now', '-7 days')`); err != nil {
		log.Printf("[维护] 自动清理过期 Token 失败: %v", err)
	}

	// 初始化 JWT 密钥
	var secret sql.NullString
	err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = 'jwt_secret'`).Scan(&secret)
	switch {
	case err == nil && secret.Valid:
		s.setCachedSecret(secret.String)
	case errors.Is(err, sql.ErrNoRows):
		newSecret := os.Getenv("JWT_SECRET")
		if newSecret == "" {
			newSecret = randomHex(32)
		}
		s.setCachedSecret(newSecret)
		if _, err := s.db.Exec(`INSERT INTO system_settings (key, value) VALUES ('jwt_secret', ?)`, newSecret); err != nil {
			return err
		}
	case err != nil:
		return err
	}

	// 初始化管理员密码（默认读取环境变量，若无则默认为 admin123）
	var pwdHash sql.NullString
	err = s.db.QueryRow(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`).Scan(&pwdHash)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		defaultPassword := os.Getenv("CRM_PASSWORD")
		if defaultPassword == "" {
			defaultPassword = "admin123"
		}
		salt := randomHex(16)
		hash := PBKDF2Hex(defaultPassword, salt, 1000, 64)
		if _, err := s.db.Exec(
			`INSERT INTO system_settings (key, value) VALUES ('crm_password_hash', ?)`,
			salt+":"+hash,
		); err != nil {
			return err
		}
	case err != nil:
		return err
	}
	return nil
}

func (s *Service) setCachedSecret(secret string) {
	s.mu.Lock()
	s.cachedSecret = secret
	s.mu.Unlock()
}

// Secret 动态获取当前的 JWT Secret。
// 与 Node 版一致：优先使用启动时缓存的密钥，缓存命中后不再回读数据库，
// 因此通过 /settings/update 修改密钥需重启服务方能生效（保持行为对齐）。
func (s *Service) Secret() (string, error) {
	s.mu.RLock()
	cached := s.cachedSecret
	s.mu.RUnlock()
	if cached != "" {
		return cached, nil
	}

	var v sql.NullString
	err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = 'jwt_secret'`).Scan(&v)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if v.Valid {
		s.setCachedSecret(v.String)
		return v.String, nil
	}
	return fallbackSecret, nil
}

// IssueToken 签发 7 天有效的管理员 Token。
func (s *Service) IssueToken() (string, error) {
	secret, err := s.Secret()
	if err != nil {
		return "", err
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"role": "admin",
		"iat":  now.Unix(),
		"exp":  now.Add(tokenTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// VerifyPassword 校验明文密码与存储的 "salt:hash" 是否匹配。
func VerifyPassword(password, stored string) bool {
	salt, hash, ok := strings.Cut(stored, ":")
	if !ok {
		// Node 版 split 后 hash 为 undefined，任何输入均比对失败
		return false
	}
	return PBKDF2Hex(password, salt, 1000, 64) == hash
}

// HashPassword 生成 "salt:hash" 格式的密码串（与 crypto.pbkdf2Sync 参数一致）。
func HashPassword(password string) string {
	salt := randomHex(16)
	return salt + ":" + PBKDF2Hex(password, salt, 1000, 64)
}

// PBKDF2Hex 按 Node 版参数计算 PBKDF2-SHA512 并输出十六进制摘要。
// 注意：salt 直接使用其字符串字节（与 pbkdf2Sync(password, salt, ...) 一致）。
func PBKDF2Hex(password, salt string, iter, keyLen int) string {
	key, err := pbkdf2.Key(sha512.New, password, []byte(salt), iter, keyLen)
	if err != nil {
		return ""
	}
	return hex.EncodeToString(key)
}

// BearerToken 从 Authorization 头提取 Bearer Token（对齐 authHeader.split(' ')[1]）。
func BearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}
	parts := strings.Split(authHeader, " ")
	if len(parts) < 2 {
		return ""
	}
	return parts[1]
}

// Middleware JWT 身份验证中间件：校验 Authorization 头中的 Bearer Token。
func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := BearerToken(r)
		if token == "" {
			web.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "message": "请先登录"})
			return
		}

		var one int
		err := s.db.QueryRow(`SELECT 1 FROM active_sessions WHERE token = ?`, token).Scan(&one)
		if errors.Is(err, sql.ErrNoRows) {
			web.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "message": "凭证已失效，请重新登录"})
			return
		}
		if err != nil {
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "鉴权失败"})
			return
		}

		secret, err := s.Secret()
		if err != nil {
			web.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "鉴权失败"})
			return
		}

		if _, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(secret), nil
		}); err != nil {
			// 签名或有效期校验失败：吊销该会话并拒绝访问
			_, _ = s.db.Exec(`DELETE FROM active_sessions WHERE token = ?`, token)
			web.WriteJSON(w, http.StatusForbidden, map[string]any{"success": false, "message": "凭证已失效，请重新登录"})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// randomHex 生成 n 字节随机数据的十六进制串（等价 crypto.randomBytes(n).toString('hex')）。
func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("生成随机数失败: %v", err))
	}
	return hex.EncodeToString(b)
}
