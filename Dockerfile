# === 阶段一：编译前端 ===
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
# 如果你使用的是 Vite，请将下面的 build 改为编译对应的命令（通常也是 npm run build，但产物可能是 dist）
RUN npm run build

# === 阶段二：编译 Go 后端 ===
FROM golang:1.25-alpine@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59 AS go-builder
WORKDIR /app/server-go
# 先复制依赖清单，利用 Docker 层缓存加速重复构建
COPY server-go/go.mod server-go/go.sum ./
RUN go mod download
# 复制后端源码并编译静态二进制（modernc.org/sqlite 为纯 Go 实现，无需 CGO）
COPY server-go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/crm-server ./cmd/server

# === 阶段三：运行时镜像 ===
FROM alpine:3.21@sha256:ce64758a109eb420d874a118f87920e625e12d3634e03b4a5573fd9f6e5d3507
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

# 内置默认配置，与 compose 的挂载/端口映射一致（compose 将 DockerData/personal-crm 挂到 /app/data）
ENV PORT=5197
ENV DB_DIR=/app/data

CMD ["/app/server/crm-server"]
