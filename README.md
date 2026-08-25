# 个人 CRM 系统

一套自托管的私人关系管理系统：React 前端 + 后端服务 + SQLite，支持联系人档案、多级标签、主题分组、名单导入（Excel）与 Immich 人脸头像集成。

## 功能特性

- **联系人管理**：姓名/曾用名/性别/民族/籍贯/生日（公历/农历）/证件/地址等全维度档案，支持亲属关系链与称谓计算
- **多级标签**：任意层级标签树（如 `同学/大学同学/智能1班`），保存联系人时按路径自动建树；标签绑定联系人时禁止删除，防止误删
- **主题分组**：自定义主题分类，成员支持绑定联系人或自由命名，带排序与备注
- **名单管理**：导入 `.xls` / `.xlsx` Excel 名单，支持关键字搜索、多列组合筛选（列间 AND / 列内 OR）、列值去重下拉、重命名与排序
- **人脸头像**：对接 [Immich](https://immich.app)，通过 face_uuid 经后端代理拉取人脸缩略图，API Key 不暴露给前端
- **安全认证**：密码登录 + JWT（7 天有效期）+ 服务端会话表，支持在线修改密码与密钥；密码使用 PBKDF2-SHA512 存储
- **精细差异比对**：保存时快照比对新旧数据，无实际修改不刷新 `updated_at` 时间戳
- **双后端实现**：Node.js（`server/`）与 Go（`server-go/`）行为完全对齐，接口契约一致，可任选其一部署

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、Ant Design 6、Tailwind CSS 3、React Router 7、dnd-kit |
| Node 后端 | Express 5、node-sqlite3、jsonwebtoken、multer、SheetJS(xlsx) |
| Go 后端 | Go 1.25、modernc.org/sqlite（纯 Go 无 CGO）、golang-jwt/v5、excelize、extrame/xls |
| 数据库 | SQLite（`crm.db` 主库 + `roster.db` 名单库） |
| 部署 | Docker 多阶段构建（前端编译 → Go 交叉编译 → Alpine 运行时） |

## 项目结构

```
personal-crm/
├── client/                  # React 前端（CRA）
│   └── src/
│       ├── api/             # axios 封装与接口调用
│       ├── components/      # 联系人卡片/标签管理/统计视图等组件
│       ├── pages/           # 登录、CRM 主页、名单管理、工具页
│       └── views/           # 统计视图等
├── server/                  # Node.js 后端（保留，与 Go 版二选一）
│   ├── server.js            # 入口：静态托管 + SPA 兜底
│   ├── routes/              # 联系人与名单路由
│   ├── controllers/         # 业务逻辑
│   ├── middleware/          # JWT 鉴权
│   ├── config/              # 数据库连接
│   └── utils/               # 独立工具脚本（batchTool、Immich 元数据导出）
├── server-go/               # Go 后端（Docker 默认构建此实现）
│   ├── cmd/server/          # main 入口
│   └── internal/
│       ├── api/             # 全部 HTTP 路由与处理器
│       ├── auth/            # JWT 签发/校验、密码哈希
│       ├── config/          # .env 加载与配置
│       ├── store/           # SQLite 打开、建表、轻量迁移
│       ├── excel/           # .xls/.xlsx 解析（对齐 SheetJS 行为）
│       └── web/             # 响应工具函数
├── Dockerfile               # 多阶段构建（前端 + Go 后端）
└── .dockerignore
```

## 快速开始（本地开发）

### 1. 启动后端（二选一）

```bash
# 方式 A：Node.js 后端
cd server
npm install
node server.js            # 开发可改用: npx nodemon server.js

# 方式 B：Go 后端（行为与 Node 版一致）
cd server-go
go run ./cmd/server
```

默认监听 `http://0.0.0.0:15197`，首次启动自动建表并初始化默认密码（`admin123`）与 JWT 密钥。

### 2. 启动前端

```bash
cd client
npm install
echo "REACT_APP_BACKEND_PORT=15197" > .env   # 开发模式指向后端端口
npm start                  # http://localhost:3000
```

> 开发模式下前端通过 `REACT_APP_BACKEND_PORT` 跨端口访问后端 API；生产构建后走相对路径 `/api`。

### 3. 登录

浏览器打开前端地址，使用默认密码 `admin123` 登录，登录后请在设置中及时修改。

## Docker 部署

```bash
docker build -t personal-crm .
docker run -d \
  -p 5197:5197 \
  -e PORT=5197 \
  -e JWT_SECRET=你的密钥 \
  -e CRM_PASSWORD=你的初始密码 \
  -v "/path/to/DockerData/personal-crm:/app/server/data" \
  --name personal-crm \
  personal-crm
```

镜像内已包含：前端构建产物（`public/`）+ Go 后端二进制，单容器即可运行。

数据持久化：将宿主机生产库目录（OneDrive 同步的 `DockerData/personal-crm`，含 `crm.db` 与 `roster.db`）bind mount 到容器内 `/app/server/data`，与原 Node 版部署共用同一份生产数据；未指定 `DB_DIR` 时容器默认读写该目录。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 后端监听端口 | `15197` |
| `DB_DIR` | SQLite 数据目录（Node 版相对 `server/`，Go 版相对工作目录） | `data` |
| `JWT_SECRET` | JWT 签名密钥，缺省时首次启动自动生成并入库 | 随机生成 |
| `CRM_PASSWORD` | 初始登录密码，仅首次初始化生效 | `admin123` |
| `IMMICH_BASE_URL` | Immich 服务地址（人脸头像代理） | 无 |
| `IMMICH_API_KEY` | Immich API Key | 无 |
| `REACT_APP_BACKEND_PORT` | （仅前端开发模式）后端端口 | 无 |

以上变量均可写入后端目录的 `.env` 文件（`server/.env` 与 `server-go/.env` 内容保持一致，均指向同一生产库目录与 Immich 配置；`.env` 已被 `.dockerignore` / `.gitignore` 排除，不会进入镜像与仓库）。

## 数据库说明

- `crm.db`：联系人主库（`contacts`、`tags`、`contact_tags`、`contact_topics`、`contact_topic_members`、`contact_relations`、`contact_methods`、`former_names`、`system_settings`、`active_sessions`）
- `roster.db`：名单库（`rosters`、`roster_rows`）
- 启动时自动建表；标签/主题删除采用安全级联（仍绑定联系人时拒绝删除）
- 会话表自动清理 7 天前的过期 Token

## 关于双后端

`server/`（Node.js）为原始实现，`server-go/` 为 Go 重写版，两者对外接口行为、响应结构、时间戳语义完全一致：

- 接口前缀：`/api`、`/api/rosters`
- 认证方式：`Authorization: Bearer <token>`（登录、名单解析外的全部接口均需鉴权）
- CORS：默认放行所有来源（OPTIONS 预检返回 204）

当前 Dockerfile 构建 Go 版；如需切回 Node 版，将阶段二/三替换为 Node 镜像 + `npm install --production` + `CMD ["node", "server.js"]` 即可。
