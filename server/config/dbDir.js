const path = require('path');
const fs = require('fs');

// 统一的数据库目录配置：env 只需配置一个 DB_DIR，系统从中读取多个数据库文件
// 例如：DB_DIR=/data/crm  →  crm.db、roster.db 均位于该目录下
const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data');

// 启动时确保目录存在（幂等）
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`[数据库] 已自动创建数据库目录: ${DB_DIR}`);
}

// 各业务库的文件路径，统一从 DB_DIR 派生
const CRM_DB_PATH = path.join(DB_DIR, 'crm.db');
const ROSTER_DB_PATH = path.join(DB_DIR, 'roster.db');

module.exports = { DB_DIR, CRM_DB_PATH, ROSTER_DB_PATH };
