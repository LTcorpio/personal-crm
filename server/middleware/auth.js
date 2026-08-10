const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbQuery, dbRun } = require('../config/database');

// 内存缓存，避免每次 API 请求都频繁查询数据库
let cachedJwtSecret = null;

/**
 * 初始化系统配置表与默认凭证（幂等，可安全重复调用）
 */
async function initSystemSettings() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS active_sessions (
            token TEXT PRIMARY KEY,
            ip TEXT,
            device TEXT,
            logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 清理 7 天以前的过期残留会话
    try {
        await dbRun(`DELETE FROM active_sessions WHERE logged_in_at < datetime('now', '-7 days')`);
    } catch (cleanError) {
        console.error("[维护] 自动清理过期 Token 失败:", cleanError);
    }

    // 初始化 JWT 密钥
    const secretRow = await dbQuery(`SELECT value FROM system_settings WHERE key = 'jwt_secret'`);
    if (secretRow.length > 0) {
        cachedJwtSecret = secretRow[0].value;
    } else {
        cachedJwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
        await dbRun(`INSERT INTO system_settings (key, value) VALUES ('jwt_secret', ?)`, [cachedJwtSecret]);
    }

    // 初始化管理员密码（默认读取环境变量，若无则默认为 admin123）
    const pwdRow = await dbQuery(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`);
    if (pwdRow.length === 0) {
        const defaultPassword = process.env.CRM_PASSWORD || 'admin123';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(defaultPassword, salt, 1000, 64, 'sha512').toString('hex');
        await dbRun(`INSERT INTO system_settings (key, value) VALUES ('crm_password_hash', ?)`, [`${salt}:${hash}`]);
    }
}

/**
 * 动态获取当前的 JWT Secret
 */
async function getJwtSecret() {
    if (cachedJwtSecret) return cachedJwtSecret;
    const row = await dbQuery(`SELECT value FROM system_settings WHERE key = 'jwt_secret'`);
    if (row.length > 0) {
        cachedJwtSecret = row[0].value;
        return cachedJwtSecret;
    }
    return 'crm_fallback_secret_2026';
}

/**
 * JWT 身份验证中间件：校验 Authorization 头中的 Bearer Token
 */
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "请先登录" });
    }

    try {
        const sessionRow = await dbQuery(`SELECT 1 FROM active_sessions WHERE token = ?`, [token]);
        if (sessionRow.length === 0) {
            return res.status(401).json({ success: false, message: "凭证已失效，请重新登录" });
        }

        const currentSecret = await getJwtSecret();
        jwt.verify(token, currentSecret, (err, decoded) => {
            if (err) {
                dbRun(`DELETE FROM active_sessions WHERE token = ?`, [token]).catch(() => {});
                return res.status(403).json({ success: false, message: "凭证已失效，请重新登录" });
            }
            next();
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "鉴权失败" });
    }
};

module.exports = { authMiddleware, initSystemSettings, getJwtSecret, cachedJwtSecret };
