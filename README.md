# 人迹（personal-crm）

一套自托管的私人关系管理系统：React 前端 + 后端服务 + SQLite，支持联系人档案、多级标签、主题分组、名单导入（Excel）与 Immich 人脸头像集成。

## 功能特性

- **联系人管理**：姓名/曾用名/性别/民族/籍贯/生日（公历/农历）/证件/地址等全维度档案，支持亲属关系链与称谓计算
- **多级标签**：任意层级标签树（如 `同学/大学同学/智能1班`），保存联系人时按路径自动建树；标签绑定联系人时禁止删除，防止误删
- **主题分组**：自定义主题分类，成员支持绑定联系人或自由命名，带排序与备注
- **名单管理**：导入 `.xls` / `.xlsx` Excel 名单，支持关键字搜索、多列组合筛选（列间 AND / 列内 OR）、列值去重下拉、重命名与排序
- **人脸头像（本地化）**：头像图片全部落盘到 `$DB_DIR/avatars`，与数据库同盘同目录，展示不再实时依赖 [Immich](https://immich.app)；Immich 的 `face_uuid` 仍保留，用于「右键头像 → 在 Immich 中浏览」跳转。图片按内容 SHA-256 命名，同一张图全库只存一份
- **本地图片裁剪**：上传本地图片时在浏览器内裁剪成正方形（导出 512×512 JPEG），裁剪前的原图一并原样存档，历史里可随时「查看 / 下载原图」或「重新裁剪」
- **历史头像管理**：记录每位联系人用过的每一张头像，标注来源（Immich / 本地上传）与是否裁剪过，支持回看、回切为当前、重新裁剪、删除；当前头像不可直接删除，物理文件在无任何引用时才回收。弹窗内的切换 / 上传 / 删除都只改本地草稿，点弹窗「保存」才真正生效，直接关闭则全部丢弃
- **改动保护**：头像弹窗与联系人编辑表单在存在未保存改动时，关闭前都会二次确认，避免误关丢失编辑内容
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
cp .env.example .env       # 开发模式指向后端端口，可按需改 PORT / REACT_APP_BACKEND_PORT
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
  -e IMMICH_BASE_URL=https://photo.home.lan \
  -e IMMICH_API_KEY=你的Immich密钥 \
  -v "$PWD/data:/app/data" \
  --name personal-crm \
  personal-crm
```

镜像内已包含：前端构建产物（`public/`）+ Go 后端二进制，单容器即可运行。

> 也可用 compose 一键起停：复制仓库根目录的 `docker-compose.example.yml` 为
> `docker-compose.yml`，按需改端口/挂载后执行 `docker compose up -d --build`。

> 容器内默认 `PORT=5197`、`DB_DIR=/app/data`，无需重复传入。

数据持久化：把宿主机数据目录（含 `crm.db`、`roster.db` 以及本地化后的 `avatars/` 头像目录）
bind mount 到容器内 `/app/data` 即可。头像与数据库同目录，外部备份服务按目录整体拷贝时
会自动覆盖，无需额外配置。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 后端监听端口 | `15197` |
| `DB_DIR` | SQLite 数据目录（Node 版相对 `server/`，Go 版相对工作目录） | `data` |
| `AVATAR_DIR` | 头像文件目录（可选），默认跟随数据库目录 | `$DB_DIR/avatars` |
| `IMMICH_BASE_URL` | Immich 服务地址，仅「抓取 / 同步头像」时访问 | `https://photo.home.lan` |
| `IMMICH_API_KEY` | Immich API Key，留空则跳过一切头像抓取（已有本地头像不受影响） | 无 |
| `REACT_APP_BACKEND_PORT` | （仅前端开发模式）后端端口 | 无 |

> `JWT_SECRET` / `CRM_PASSWORD` 属于 Node 版；当前 Go 版的身份认证已交给反向代理层（Authelia SSO），不再使用这两项。

以上变量均可写入 `.env` 文件（`client/.env`、`server/.env`、`server-go/.env`）。

**`.env` 不入库，仓库里只提交 `.env.example`。** 各目录均提供 `client/.env.example`、`server/.env.example`、`server-go/.env.example`，复制成 `.env` 后按需修改即可；`.env` 已被根 `.gitignore` 与 `.dockerignore` 排除，含密钥与本机路径的真实配置不会进入仓库或镜像。

## 数据库说明

- `crm.db`：联系人主库（`contacts`、`tags`、`contact_tags`、`contact_topics`、`contact_topic_members`、`contact_relations`、`contact_methods`、`former_names`、`contact_avatars`、`system_settings`、`active_sessions`）
- `roster.db`：名单库（`rosters`、`roster_rows`）
- `avatars/`：本地头像文件目录，文件名即图片内容的 SHA-256（`<hash>.<ext>`），同一张图全库只存一份
- 启动时自动建表并做轻量列迁移（如 `contacts.avatar_hash`）；标签/主题删除采用安全级联（仍绑定联系人时拒绝删除）

### 头像数据模型

| 位置 | 作用 |
| --- | --- |
| `contacts.face_uuid` | Immich 人物 UUID，仅用于「在 Immich 中浏览」跳转 |
| `contacts.avatar_hash` | 当前头像指向的内容哈希 |
| `contact_avatars` | 每位联系人用过的历史头像（`hash` + `face_uuid` + `source`，上传来源另存 `original_hash` / `original_file_name`），`UNIQUE(contact_id, hash)` |
| `$AVATAR_DIR/<hash>.<ext>` | 头像文件：展示用方图与裁剪前的原图同目录存放，按内容寻址，全局去重 |

- 抓取时机：后端启动时自动补齐「已绑定 face_uuid 但本地无图」的联系人；修改 `face_uuid` 保存时自动抓取；
  前端头像管理弹窗内可手动「从 Immich 获取」或「上传本地图片」
- 生效时机：头像弹窗内的改动（切换当前 / 上传 / 删除历史）先留在本地草稿，点弹窗「保存」才写库；直接关闭则丢弃
- 上传流程：前端裁剪成正方形后，把方图与裁剪前的原图（可选）一起提交，两者都按内容哈希落盘去重；
  选「不裁剪，直接用原图」时只传一份（`original_is_file` 标记），后端把方图同时认定为原图
- 重新裁剪：带原图的历史头像可随时「重新裁剪」，前端取回存档原图重新取景，结果作为一张新头像入库，原图沿用不重复占盘
- 原图下载：`GET /api/avatars/<file>?download=1[&filename=]<可选文件名>` 以附件形式返回（下载名同时给出 ASCII 回退与 RFC 5987 UTF-8 形式，并过滤引号 / 控制字符等危险字符）
- 删除规则：当前头像不可直接删除；磁盘文件（含原图）仅当「方图列 + 原图列」全局都无引用时才回收
- 清空 `face_uuid` 不会删除本地头像——两者已解耦

## 关于双后端

`server/`（Node.js）为原始实现，`server-go/` 为 Go 重写版，两者对外接口行为、响应结构、时间戳语义完全一致：

- 接口前缀：`/api`、`/api/rosters`
- 认证方式：`Authorization: Bearer <token>`（登录、名单解析外的全部接口均需鉴权）
- CORS：默认放行所有来源（OPTIONS 预检返回 204）

当前 Dockerfile 构建 Go 版；如需切回 Node 版，将阶段二/三替换为 Node 镜像 + `npm install --production` + `CMD ["node", "server.js"]` 即可。
