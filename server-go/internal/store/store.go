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

	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
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

// CloseWithCheckpoint 优雅关闭一个数据库（WAL 模式专用）：
// 1. 先执行 wal_checkpoint(TRUNCATE)，把 -wal 中已提交的内容合并回主库并截断日志文件；
// 2. 再 Close 关闭连接——最后一个连接正常关闭后，SQLite 会自动删除 -wal 与 -shm 文件。
// 这样服务停止后数据目录只会留下 .db 主文件，便于外部备份服务直接整文件拷贝。
// 注意：若进程被 kill -9 / 断电强杀，此流程不会执行，-wal 文件会保留，
// 但下次打开连接时 SQLite 会自动回放合并，数据不会丢失。
func CloseWithCheckpoint(db *sql.DB, name string) {
	if db == nil {
		return
	}
	var busy, walPages, checkpointed int
	if err := db.QueryRow(`PRAGMA wal_checkpoint(TRUNCATE)`).Scan(&busy, &walPages, &checkpointed); err != nil {
		log.Printf("[%s] WAL checkpoint 失败（继续尝试关闭）: %v", name, err)
	} else {
		log.Printf("[%s] WAL 已合并落盘（busy=%d, 合并页数=%d）", name, busy, checkpointed)
	}
	if err := db.Close(); err != nil {
		log.Printf("[%s] 数据库关闭失败: %v", name, err)
		return
	}
	log.Printf("[%s] 数据库已优雅关闭", name)
}
