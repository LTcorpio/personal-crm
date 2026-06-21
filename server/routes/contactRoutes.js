const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db, dbQuery, dbRun } = require('../config/database');
const contactController = require('../controllers/contactController');

// 内存缓存，避免每次 API 请求都频繁查询数据库
let cachedJwtSecret = null;

/**
 * 初始化系统配置表与默认凭证
 */
async function initSystemSettings() {
    // 1. 创建配置表（如果不存在）
    await dbRun(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. 初始化 JWT 密钥
    const secretRow = await dbQuery(`SELECT value FROM system_settings WHERE key = 'jwt_secret'`);
    if (secretRow.length > 0) {
        cachedJwtSecret = secretRow[0].value;
    } else {
        // 优先读取环境配置，没有则随机生成一个 64 位强密钥
        cachedJwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
        await dbRun(`INSERT INTO system_settings (key, value) VALUES ('jwt_secret', ?)`, [cachedJwtSecret]);
    }

    // 3. 初始化管理员密码（默认读取环境变量，若无则默认为 admin123）
    const pwdRow = await dbQuery(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`);
    if (pwdRow.length === 0) {
        const defaultPassword = process.env.CRM_PASSWORD || 'admin123';
        const salt = crypto.randomBytes(16).toString('hex');
        // 使用标准的 PBKDF2 算法进行不可逆哈希
        const hash = crypto.pbkdf2Sync(defaultPassword, salt, 1000, 64, 'sha512').toString('hex');
        await dbRun(`INSERT INTO system_settings (key, value) VALUES ('crm_password_hash', ?)`, [`${salt}:${hash}`]);
    }
}

// 执行初始化
initSystemSettings().catch(err => console.error("初始化系统安全配置失败:", err));

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

// ==========================================
// 1. 登录验证接口（此接口不加拦截中间件）
// ==========================================
router.post('/auth/login', async (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, message: "密码不能为空" });
    }

    try {
        const pwdRow = await dbQuery(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`);
        if (pwdRow.length === 0) {
            return res.status(500).json({ success: false, message: "系统未初始化，请稍后再试" });
        }

        const [salt, storedHash] = pwdRow[0].value.split(':');
        const incomingHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

        if (incomingHash === storedHash) {
            // 验证通过，获取动态密钥并签发 Token
            const currentSecret = await getJwtSecret();
            const token = jwt.sign({ role: 'admin' }, currentSecret, { expiresIn: '7d' });
            return res.json({ success: true, token });
        }

        return res.status(401).json({ success: false, message: "密码错误，拒绝访问" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "服务器内部错误" });
    }
});

// ==========================================
// 2. JWT 身份验证中间件
// ==========================================
const authMiddleware = async (req, res, next) => {
    if (req.path.startsWith('/proxy-face/') || req.path.startsWith('/auth/login')) {
        return next();
    }

    // 从请求头获取 Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "请先登录" });
    }

    try {
        const currentSecret = await getJwtSecret();
        jwt.verify(token, currentSecret, (err, decoded) => {
            if (err) {
                return res.status(403).json({ success: false, message: "凭证已过期或无效，请重新登录" });
            }
            next();
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "鉴权失败" });
    }
};

router.use(authMiddleware);

// ==========================================
// 新增：修改密码和密钥的后端接口
// ==========================================
router.post('/settings/update', async (req, res) => {
    // 1. 接收参数增加 oldPassword
    const { oldPassword, newPassword, newJwtSecret } = req.body;

    if (!newPassword && !newJwtSecret) {
        return res.status(400).json({ success: false, message: "未提供任何修改项" });
    }

    try {
        // 2. 如果用户请求修改密码，先强制验证旧密码
        if (newPassword) {
            if (!oldPassword) {
                return res.status(400).json({ success: false, message: "请输入原旧密码进行身份验证" });
            }
            
            // 从数据库取出当前的哈希密码
            const pwdRow = await dbQuery(`SELECT value FROM system_settings WHERE key = 'crm_password_hash'`);
            if (pwdRow.length === 0) {
                return res.status(500).json({ success: false, message: "系统配置未完成初始化" });
            }

            const [salt, storedHash] = pwdRow[0].value.split(':');
            const oldIncomingHash = crypto.pbkdf2Sync(oldPassword, salt, 1000, 64, 'sha512').toString('hex');

            // 核心比对：如果输入的旧密码哈希值与数据库不一致，直接拒绝
            if (oldIncomingHash !== storedHash) {
                return res.status(401).json({ success: false, message: "原密码输入错误，验证失败" });
            }
        }

        // 3. 验证通过后，开始事务写入新密码
        await dbRun('BEGIN TRANSACTION');

        if (newPassword) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.pbkdf2Sync(newPassword, salt, 1000, 64, 'sha512').toString('hex');
            await dbRun(`
                INSERT OR REPLACE INTO system_settings (key, value, updated_at) 
                VALUES ('crm_password_hash', ?, CURRENT_TIMESTAMP)
            `, [`${salt}:${hash}`]);
        }

        if (newJwtSecret) {
            await dbRun(`
                INSERT OR REPLACE INTO system_settings (key, value, updated_at) 
                VALUES ('jwt_secret', ?, CURRENT_TIMESTAMP)
            `, [newJwtSecret]);
            cachedJwtSecret = newJwtSecret;
        }

        await dbRun('COMMIT');
        return res.json({ success: true, message: "密码修改成功！" });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error("更新安全设置失败:", error);
        return res.status(500).json({ success: false, message: "服务器保存失败" });
    }
});

// 联系人增删改查
router.post('/contacts', contactController.saveContact);
router.get('/contacts', contactController.getContacts);
router.delete('/contacts/:id', contactController.deleteContact);

// 标签树管理
router.get('/tags/tree', contactController.getTagTree);
router.put('/tags/order', contactController.updateTagsOrder);
router.delete('/tags/:id', contactController.deleteTag);

// 主题分类管理
router.get('/topics', contactController.getTopics);
router.post('/topics', contactController.createTopic);
router.put('/topics/order', contactController.updateTopicsOrder)
router.put('/topics/:id', contactController.updateTopic);
router.delete('/topics/:id', contactController.deleteTopic);

// Immich 图片中转代理
router.get('/proxy-face/:uuid', contactController.proxyFaceImage);

module.exports = router;
