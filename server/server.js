require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const contactRoutes = require('./routes/contactRoutes');
const rosterRoutes = require('./routes/rosterRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 15197;

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 解析 JSON 请求体（名单导入数据量较大，放宽限制）

// 1. 路由挂载 (必须放在静态资源托管之前，优先匹配 API 请求)
app.use('/api', contactRoutes);
app.use('/api/rosters', rosterRoutes);

// 2. [生产] 托管前端打包后的静态资源文件（Docker 构建时会将前端 build 产物复制到这里的 public 目录）
app.use(express.static(path.join(__dirname, 'public')));

// 3. [生产] 兜底路由：捕获所有其他非 /api 的 GET 请求，返回前端的 index.html（完美支持 React Router 刷新）
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`个人 CRM 后端服务已启动`);
    console.log(`本地访问地址: http://localhost:${PORT}`);
    console.log(`局域网访问地址: http://0.0.0.0:${PORT}`);
});