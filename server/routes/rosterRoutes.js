const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rosterController = require('../controllers/rosterController');
const { authMiddleware } = require('../middleware/auth');

// 所有名单管理接口均需登录鉴权
router.use(authMiddleware);

// ==========================================
// 文件上传配置：临时存储到系统临时目录
// ==========================================
const uploadDir = path.join(require('os').tmpdir(), 'crm-roster-uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // 加时间戳前缀避免重名冲突
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.xls' || ext === '.xlsx') {
            cb(null, true);
        } else {
            cb(new Error('仅支持 .xls 和 .xlsx 格式的 Excel 文件'));
        }
    },
    limits: { fileSize: 20 * 1024 * 1024 } // 限制 20MB
});

// ==========================================
// 名单管理路由定义
// ==========================================

// 解析上传的 Excel 文件（返回预览数据，不落库）
router.post('/parse', upload.single('file'), rosterController.parseRoster);

// 确认导入：保存到数据库
router.post('/', rosterController.saveRoster);

// 获取所有名单列表
router.get('/', rosterController.getRosters);

// 搜索 / 筛选（跨名单聚合或指定名单）
router.get('/search', rosterController.searchRosters);

// 批量调整名单显示顺序
router.put('/order', rosterController.updateRostersOrder);

// 获取指定名单中某列的不重复值（用于筛选下拉选项）
router.get('/:id/column-values', rosterController.getColumnValues);

// 获取单份名单完整数据
router.get('/:id', rosterController.getRosterById);

// 重命名名单
router.put('/:id/name', rosterController.renameRoster);

// 更新名单的可筛选字段
router.put('/:id/filterable-columns', rosterController.updateFilterableColumns);

// 删除一份名单
router.delete('/:id', rosterController.deleteRoster);

module.exports = router;
