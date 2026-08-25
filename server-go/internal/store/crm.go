package store

import (
	"database/sql"
	"fmt"
	"log"
)

// OpenCRM 打开主业务库并按需建表（对应 config/database.js）。
func OpenCRM(path string) (*sql.DB, error) {
	db, err := openSQLite(path)
	if err != nil {
		log.Printf("数据库连接失败: %v", err)
		return nil, err
	}
	log.Printf("数据库成功连接，路径: %s", path)

	// 建表语句与 Node 版完全一致（幂等）
	statements := []string{
		// 1. 联系人主表
		`CREATE TABLE IF NOT EXISTS contacts (
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
        )`,
		// 2. 标签定义表 (支持多级树状结构)
		`CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE(name, parent_id)
        )`,
		// 3. 联系人-标签 中间表
		`CREATE TABLE IF NOT EXISTS contact_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            tag_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )`,
		// 4. 曾用名表
		`CREATE TABLE IF NOT EXISTS former_names (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        )`,
		// 5. 联系方式表
		`CREATE TABLE IF NOT EXISTS contact_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id TEXT,
            type TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(contact_id, type),
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        )`,
		// 6. 联系人关系表
		`CREATE TABLE IF NOT EXISTS contact_relations (
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
        )`,
		// 7. 主题分类表
		`CREATE TABLE IF NOT EXISTS contact_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#ffffff',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
		// 8. 主题-人员成员表
		`CREATE TABLE IF NOT EXISTS contact_topic_members (
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
        )`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			db.Close()
			return nil, fmt.Errorf("初始化 CRM 表结构失败: %w", err)
		}
	}
	return db, nil
}
