// Package config 加载 .env 与环境变量，统一管理系统级配置。
//
// 行为与 Node 版（dotenv + process.env）保持一致：
//   - 从当前工作目录读取 .env 文件；
//   - 不覆盖已存在的环境变量。
package config

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

var (
	// Port 服务监听端口（PORT，默认 15197，与 server.js 一致）
	Port int
	// DBDir 数据库目录（DB_DIR，默认 ./data）
	DBDir string
	// CRMDBPath 主库文件路径（$DB_DIR/crm.db）
	CRMDBPath string
	// RosterDBPath 名单库文件路径（$DB_DIR/roster.db）
	RosterDBPath string
	// StaticDir 前端静态资源目录（Docker 部署时为 ./public）
	StaticDir string
)

func init() {
	loadDotEnv(".env")

	Port = envInt("PORT", 15197)

	// Node 版默认值相对 server 源码目录（server/data）；
	// Go 版以工作目录为基准，Docker 中 WORKDIR 与 Node 镜像保持一致（/app/server）
	DBDir = os.Getenv("DB_DIR")
	if DBDir == "" {
		DBDir = "data"
	}
	CRMDBPath = filepath.Join(DBDir, "crm.db")
	RosterDBPath = filepath.Join(DBDir, "roster.db")

	StaticDir = "public"
}

// loadDotEnv 解析 .env 文件，语义对齐 dotenv：仅设置尚不存在的环境变量。
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // 文件不存在时静默跳过（与 dotenv 一致）
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		// 去除成对的单/双引号
		if len(v) >= 2 && (v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
			v = v[1 : len(v)-1]
		}
		if k == "" {
			continue
		}
		// 已存在的环境变量不覆盖（dotenv 默认行为）
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("读取 .env 失败: %v", err)
	}
}

// envInt 读取整型环境变量，非法或缺省时返回默认值（对齐 Number(x) || default 语义）。
func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if n == 0 {
		return fallback // Number("0") 为假值，同样回退默认端口
	}
	return n
}
