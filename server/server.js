require('dotenv').config();
const express = require('express');
const cors = require('cors');
const contactRoutes = require('./routes/contactRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 15197;

// 中间件配置
app.use(cors());
app.use(express.json()); // 解析 JSON 请求体

// 路由挂载
app.use('/api', contactRoutes);

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`个人 CRM 后端服务已启动`);
    console.log(`本地访问地址: http://localhost:${PORT}`);
    console.log(`局域网访问地址: http://0.0.0.0:${PORT}`);
});