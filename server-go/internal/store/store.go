// Package store 负责 SQLite 数据库的打开、建表与轻量迁移。
//
// 与 Node 版（node-sqlite3）保持一致的关键点：
//   - 启用外键约束（PRAGMA foreign_keys = ON，经 DSN 对每个连接生效）；
//   - 单连接串行访问，等价于 node-sqlite3 单连接 + db.serialize 的语义，
//     保证 BEGIN/COMMIT 事务与普通查询始终运行在同一连接上。
package store

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	// 注册 modernc.org/sqlite 驱动（纯 Go 实现，无 CGO 依赖，便于交叉编译）
	_ "modernc.org/sqlite"
)

// openSQLite 打开（必要时创建）一个 SQLite 数据库文件。
func openSQLite(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			if err := os.MkdirAll(dir, 0o755); err == nil {
				log.Printf("[数据库] 已自动创建数据库目录: %s", dir)
			}
		}
	}

	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
