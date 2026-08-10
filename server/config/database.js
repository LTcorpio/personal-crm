const sqlite3 = require('sqlite3').verbose();
const { CRM_DB_PATH } = require('./dbDir');

const db = new sqlite3.Database(CRM_DB_PATH, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log(`数据库成功连接，路径: ${CRM_DB_PATH}`);
    }
});

// 启用外键约束
db.run('PRAGMA foreign_keys = ON');

db.serialize(() => {
    // 1. 联系人主表
    db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            face_uuid TEXT,
            name TEXT NOT NULL,
            gender INTEGER,
            ethnicity TEXT,
            native_place TEXT,
            title TEXT,
            birthday_solar TEXT,
            birthday_lunar TEXT,
            deathday TEXT,
            id_card TEXT,
            location TEXT,
            address TEXT,
            extra TEXT,
            remark TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. 标签定义表 (支持多级树状结构)
    db.run(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE(name, parent_id)
        )
    `);

    // 3. 联系人-标签 中间表
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            tag_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    `);

    // 4. 曾用名表
    db.run(`
        CREATE TABLE IF NOT EXISTS former_names (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        )
    `);

    // 5. 联系方式表
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            type TEXT NOT NULL, -- 'wechat', 'qq', 'email', 'tel' 等
            value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(contact_id, type),
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        )
    `);

    // 6. 联系人关系表
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            related_contact_id TEXT,
            related_name TEXT NOT NULL,
            relation TEXT NOT NULL,
            remark TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
            FOREIGN KEY (related_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
        )
    `);

    // 7. 主题分类表
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#ffffff',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 8. 主题-人员成员表
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_topic_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id INTEGER NOT NULL,
            contact_id TEXT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            remark TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (topic_id) REFERENCES contact_topics(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
        )
    `);
});

// 封装成 Promise 方便使用 async/await
const dbQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

module.exports = { db, dbQuery, dbRun };