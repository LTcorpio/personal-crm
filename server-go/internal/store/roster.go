package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"crm-server/internal/web"
)

// OpenRoster 打开名单库（独立于主库的 SQLite 文件），建表并执行轻量迁移
// （对应 config/rosterDatabase.js）。
func OpenRoster(path string) (*sql.DB, error) {
	db, err := openSQLite(path)
	if err != nil {
		log.Printf("[名单库] 连接失败: %v", err)
		return nil, err
	}
	log.Printf("[名单库] 成功连接，路径: %s", path)

	statements := []string{
		// 1. 名单元数据表：每条记录对应一份导入的 Excel 表格
		`CREATE TABLE IF NOT EXISTS rosters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            original_filename TEXT,
            columns TEXT NOT NULL,
            row_count INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
		// 2. 名单行数据表：每行以 JSON 数组形式存储 [值1, 值2, ...]
		`CREATE TABLE IF NOT EXISTS roster_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roster_id INTEGER NOT NULL,
            row_index INTEGER NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (roster_id) REFERENCES rosters(id) ON DELETE CASCADE
        )`,
		`CREATE INDEX IF NOT EXISTS idx_roster_rows_roster_id ON roster_rows(roster_id)`,
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			db.Close()
			return nil, fmt.Errorf("初始化名单表结构失败: %w", err)
		}
	}

	if err := migrateRosterColumns(db); err != nil {
		db.Close()
		return nil, err
	}
	if err := migrateRosterRowData(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// migrateRosterColumns 兼容旧库：若 sort_order / filterable_columns 列不存在则自动添加。
func migrateRosterColumns(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(rosters)`)
	if err != nil {
		return nil // 与 Node 版一致：查询失败时静默返回
	}
	defer rows.Close()

	hasSortOrder, hasFilterable := false, false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var dfltValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return nil
		}
		switch name {
		case "sort_order":
			hasSortOrder = true
		case "filterable_columns":
			hasFilterable = true
		}
	}

	if !hasSortOrder {
		if _, err := db.Exec(`ALTER TABLE rosters ADD COLUMN sort_order INTEGER DEFAULT 0`); err != nil {
			return fmt.Errorf("添加 sort_order 列失败: %w", err)
		}
		log.Println("[名单库] 已自动添加 sort_order 列")
	}
	if !hasFilterable {
		if _, err := db.Exec(`ALTER TABLE rosters ADD COLUMN filterable_columns TEXT`); err != nil {
			return fmt.Errorf("添加 filterable_columns 列失败: %w", err)
		}
		log.Println("[名单库] 已自动添加 filterable_columns 列")
	}
	return nil
}

// migrateRosterRowData 将旧的对象格式 data（{"列名":"值",...}）转为数组格式
// ["值1","值2",...]，列顺序以 rosters.columns 为准；已是数组格式的跳过。
func migrateRosterRowData(db *sql.DB) error {
	rosters, err := db.Query(`SELECT id, columns FROM rosters`)
	if err != nil {
		return nil
	}
	type rosterMeta struct {
		id      int64
		columns []string
	}
	var metas []rosterMeta
	for rosters.Next() {
		var id int64
		var columnsRaw string
		if err := rosters.Scan(&id, &columnsRaw); err != nil {
			continue
		}
		var columns []string
		if err := json.Unmarshal([]byte(columnsRaw), &columns); err != nil {
			continue
		}
		if len(columns) == 0 {
			continue
		}
		metas = append(metas, rosterMeta{id, columns})
	}
	rosters.Close()

	for _, meta := range metas {
		rows, err := db.Query(`SELECT id, data FROM roster_rows WHERE roster_id = ?`, meta.id)
		if err != nil {
			continue
		}
		type rowItem struct {
			id   int64
			data string
		}
		var items []rowItem
		for rows.Next() {
			var it rowItem
			if err := rows.Scan(&it.id, &it.data); err != nil {
				continue
			}
			items = append(items, it)
		}
		rows.Close()

		migrated := 0
		for _, it := range items {
			var parsed any
			if err := json.Unmarshal([]byte(it.data), &parsed); err != nil {
				continue
			}
			obj, ok := parsed.(map[string]any)
			if !ok {
				continue // 数组格式已是最新的
			}
			arr := make([]string, len(meta.columns))
			for i, col := range meta.columns {
				if v, exists := obj[col]; exists {
					arr[i] = web.JSString(v)
				} else {
					arr[i] = ""
				}
			}
			encoded, err := json.Marshal(arr)
			if err != nil {
				continue
			}
			if _, err := db.Exec(`UPDATE roster_rows SET data = ? WHERE id = ?`, string(encoded), it.id); err == nil {
				migrated++
			}
		}
		if migrated > 0 {
			log.Printf("[名单库] 已迁移名单 #%d 的 %d 行数据为数组格式", meta.id, migrated)
		}
	}
	return nil
}
