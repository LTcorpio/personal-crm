const sqlite3 = require('sqlite3').verbose();
const { ROSTER_DB_PATH } = require('./dbDir');

// 名单管理使用独立的 SQLite 文件，与主 CRM 数据隔离
// 路径由统一的 DB_DIR 派生，保证与主库共处同一数据卷，便于备份/迁移
const rosterDb = new sqlite3.Database(ROSTER_DB_PATH, (err) => {
    if (err) {
        console.error('[名单库] 连接失败:', err.message);
    } else {
        console.log(`[名单库] 成功连接，路径: ${ROSTER_DB_PATH}`);
    }
});

rosterDb.run('PRAGMA foreign_keys = ON');

rosterDb.serialize(() => {
    // 1. 名单元数据表：每条记录对应一份导入的 Excel 表格
    rosterDb.run(`
        CREATE TABLE IF NOT EXISTS rosters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            original_filename TEXT,
            columns TEXT NOT NULL,
            row_count INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 兼容旧库：若 sort_order 列不存在则自动添加
    rosterDb.all("PRAGMA table_info(rosters)", (err, rows) => {
        if (err) return;
        const hasSortOrder = rows.some(r => r.name === 'sort_order');
        if (!hasSortOrder) {
            rosterDb.run(`ALTER TABLE rosters ADD COLUMN sort_order INTEGER DEFAULT 0`);
            console.log('[名单库] 已自动添加 sort_order 列');
        }
    });

    // 2. 名单行数据表：每行以 JSON 形式存储 {列名: 值}
    //    采用 JSON 存储而非 EAV 模型，兼顾灵活性与查询简洁性
    rosterDb.run(`
        CREATE TABLE IF NOT EXISTS roster_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roster_id INTEGER NOT NULL,
            row_index INTEGER NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (roster_id) REFERENCES rosters(id) ON DELETE CASCADE
        )
    `);

    // 按名单 ID 查询行的索引
    rosterDb.run(`CREATE INDEX IF NOT EXISTS idx_roster_rows_roster_id ON roster_rows(roster_id)`);
});

// Promise 封装，与主库保持一致的用法
const rosterQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        rosterDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const rosterRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        rosterDb.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

module.exports = { rosterDb, rosterQuery, rosterRun };
