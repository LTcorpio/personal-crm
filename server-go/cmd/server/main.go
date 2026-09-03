// 个人 CRM 后端服务（Go 版）：入口对应 Node 版 server.js 的启动流程。
//
// 停机流程（对应 SQLite WAL 模式的正常落盘要求）：
//  1. 收到 SIGINT（Ctrl+C）/ SIGTERM（docker stop）信号；
//  2. srv.Shutdown 优雅排空在途 HTTP 请求（最长等 10 秒）；
//  3. 对主库/名单库执行 wal_checkpoint(TRUNCATE) 并关闭连接，
//     确保 -wal 内容合并回主库、-wal/-shm 文件被删除后再退出。
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"crm-server/internal/api"
	"crm-server/internal/auth"
	"crm-server/internal/config"
	"crm-server/internal/store"
)

func main() {
	crm, err := store.OpenCRM(config.CRMDBPath)
	if err != nil {
		log.Fatalf("主数据库初始化失败: %v", err)
	}

	roster, err := store.OpenRoster(config.RosterDBPath)
	if err != nil {
		crm.Close()
		log.Fatalf("名单数据库初始化失败: %v", err)
	}

	authSvc := auth.NewService(crm)
	if err := authSvc.Init(); err != nil {
		store.CloseWithCheckpoint(crm, "主库")
		store.CloseWithCheckpoint(roster, "名单库")
		log.Fatalf("认证服务初始化失败: %v", err)
	}

	server := api.NewServer(crm, roster, authSvc, config.StaticDir)

	addr := fmt.Sprintf("0.0.0.0:%d", config.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: server.Handler(),
	}

	log.Println("个人 CRM 后端服务已启动")
	log.Printf("本地访问地址: http://localhost:%d", config.Port)
	log.Printf("局域网访问地址: http://%s", addr)

	// 监听退出信号（Ctrl+C 与 docker stop）
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "服务器启动失败: %v\n", err)
			store.CloseWithCheckpoint(crm, "主库")
			store.CloseWithCheckpoint(roster, "名单库")
			os.Exit(1)
		}
	case <-ctx.Done():
		log.Println("收到退出信号，开始优雅停机…")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err := srv.Shutdown(shutdownCtx)
		cancel()
		if err != nil {
			log.Printf("HTTP 优雅停机超时/失败（继续关闭数据库）: %v", err)
		}
		// 在事务边界之外、连接关闭之前，把 WAL 合并回主库并删除 -wal/-shm
		store.CloseWithCheckpoint(crm, "主库")
		store.CloseWithCheckpoint(roster, "名单库")
		log.Println("服务已停止")
	}
}
