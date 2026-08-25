// 个人 CRM 后端服务（Go 版）：入口对应 Node 版 server.js 的启动流程。
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

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
	defer crm.Close()

	roster, err := store.OpenRoster(config.RosterDBPath)
	if err != nil {
		log.Fatalf("名单数据库初始化失败: %v", err)
	}
	defer roster.Close()

	authSvc := auth.NewService(crm)
	if err := authSvc.Init(); err != nil {
		log.Fatalf("认证服务初始化失败: %v", err)
	}

	server := api.NewServer(crm, roster, authSvc, config.StaticDir)

	addr := fmt.Sprintf("0.0.0.0:%d", config.Port)
	log.Println("个人 CRM 后端服务已启动")
	log.Printf("本地访问地址: http://localhost:%d", config.Port)
	log.Printf("局域网访问地址: http://%s", addr)

	if err := http.ListenAndServe(addr, server.Handler()); err != nil {
		fmt.Fprintf(os.Stderr, "服务器启动失败: %v\n", err)
		os.Exit(1)
	}
}
