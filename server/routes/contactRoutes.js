const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbQuery, dbRun } = require('../config/database');
const contactController = require('../controllers/contactController');
const { authMiddleware, initSystemSettings, getJwtSecret, cachedJwtSecret: _cachedSecret } = require('../middleware/auth');

// 可变的 JWT Secret 缓存引用，供修改密钥后即时更新
let cachedJwtSecret = _cachedSecret;

// 执行系统配置初始化（幂等）
initSystemSettings().catch(err => console.error("初始化系统安全配置失败:", err));

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
            // req.headers['x-forwarded-for'] 用于穿透代理（如 Nginx）获取真实 IP
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '未知IP';
            const device = req.headers['user-agent'] || '未知设备';
            await dbRun(
                `INSERT OR REPLACE INTO active_sessions (token, ip, device) VALUES (?, ?, ?)`,
                [token, ip, device]
            );
            return res.json({ success: true, token });
        }

        return res.status(401).json({ success: false, message: "密码错误，拒绝访问" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "服务器内部错误" });
    }
});

// ==========================================
// 2. JWT 身份验证中间件（后续所有接口均需鉴权）
// ==========================================
router.use(authMiddleware);

// 退出登录
router.post('/auth/logout', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            await dbRun(`DELETE FROM active_sessions WHERE token = ?`, [token]);
        }

        return res.json({ success: true, message: "安全退出成功" });
    } catch (error) {
        console.error("注销会话失败:", error);
        return res.status(500).json({ success: false, message: "服务器内部错误，退出失败" });
    }
});

// ==========================================
// 修改密码和密钥的后端接口
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
router.put('/contacts/order', contactController.updateContactsOrder);
router.delete('/contacts/:id', contactController.deleteContact);

// 标签树管理
router.get('/tags/tree', contactController.getTagTree);
router.put('/tags/order', contactController.updateTagsOrder);
router.put('/tags/:id', contactController.updateTag);
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
