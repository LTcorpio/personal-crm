require('dotenv').config();
const express = require('express');
const cors = require('cors');
const contactRoutes = require('./routes/contactRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(cors());
app.use(express.json()); // 解析 JSON 请求体

// 路由挂载
app.use('/api', contactRoutes);

// 启动服务器
app.listen(PORT, () => {
    console.log(`个人 CRM 后端服务已启动：http://localhost:${PORT}`);
});