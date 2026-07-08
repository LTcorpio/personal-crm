# === 阶段一：编译前端 ===
FROM node:22-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
# 如果你使用的是 Vite，请将下面的 build 改为编译对应的命令（通常也是 npm run build，但产物可能是 dist）
RUN npm run build

# === 阶段二：构建后端并合并 ===
FROM node:22-alpine
# 安装 Python3 以及编译工具（部分 Node 库或 Python 脚本可能需要）
# RUN apk add --no-cache python3 make g++ py3-pip

WORKDIR /app

# 复制后端依赖并安装（仅安装生产环境依赖）
COPY server/package*.json ./server/
RUN cd server && npm install --production

# 如果你的 Python 脚本需要第三方库（如 pandas, requests），请取消下行注释并修改：
# RUN pip3 install requests pandas openpyxl --break-system-packages

# 复制后端源码
COPY server/ ./server/

# 将阶段一编译好的前端静态文件，复制到后端的 public 目录中
# (注：如果你的前端打包产物是 dist，请将 client/build 改为 client/dist)
COPY --from=frontend-builder /app/client/build ./server/public

# 暴露后端端口
EXPOSE 15197

WORKDIR /app/server
CMD ["node", "server.js"]