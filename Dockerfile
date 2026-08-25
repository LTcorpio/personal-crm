# === 阶段一：编译前端 ===
FROM node:22-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
# 如果你使用的是 Vite，请将下面的 build 改为编译对应的命令（通常也是 npm run build，但产物可能是 dist）
RUN npm run build

# === 阶段二：编译 Go 后端 ===
# 原 Node 后端（server/ 目录）保留在仓库中，此处仅构建 Go 实现（server-go/）
FROM golang:1.25-alpine AS go-builder
WORKDIR /app/server-go
# 先复制依赖清单，利用 Docker 层缓存加速重复构建
COPY server-go/go.mod server-go/go.sum ./
RUN go mod download
# 复制后端源码并编译静态二进制（modernc.org/sqlite 为纯 Go 实现，无需 CGO）
COPY server-go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/crm-server ./cmd/server

# === 阶段三：运行时镜像 ===
FROM alpine:3.21
# ca-certificates 供代理 Immich HTTPS 接口使用
RUN apk add --no-cache ca-certificates

WORKDIR /app/server

# 复制 Go 编译产物
COPY --from=go-builder /app/crm-server /app/server/crm-server

# 将阶段一编译好的前端静态文件，复制到后端的 public 目录中
# (注：如果你的前端打包产物是 dist，请将 client/build 改为 client/dist)
COPY --from=frontend-builder /app/client/build ./public

# 暴露端口（与 docker-compose.yml 中 PORT 保持一致）
EXPOSE 5197

CMD ["/app/server/crm-server"]
