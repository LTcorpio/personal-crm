// require('dotenv').config();
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const { dbRun } = require('./config/database'); // 引入你现有的数据库连接

const app = express();
const PORT = 3009;

app.use(express.json({ limit: '50mb' }));
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 1. 前端页面：直接访问 http://localhost:3009
// ==========================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>CRM 联系人批量导入工具</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/layui/2.9.24/css/layui.css">
    <style>
        body { padding: 40px; background-color: #f2f2f2; font-family: sans-serif; }
        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .upload-area { border: 2px dashed #009688; padding: 40px; text-align: center; cursor: pointer; border-radius: 4px; margin-bottom: 20px; }
        .upload-area:hover { background: #f0f9f8; }
        .preview-table-container { max-height: 400px; overflow-y: auto; margin-top: 15px; }
    </style>
</head>
<body>

<div class="container">
    <h2><i class="layui-icon layui-icon-user"></i> CRM 联系人批量数据导入</h2>
    <hr class="layui-border-cyan">
    
    <div style="margin-bottom: 20px;">
        <p style="color: #666; line-height: 1.8;">
            <strong>使用说明：</strong><br>
            1. 上传一个 Excel 文件（支持 .xlsx, .xls）。<br>
            2. <strong>主键 ID 由系统自动生成</strong>，Excel 中无需包含 ID 列。<br>
            3. 表头名称需与数据库字段严格对应（或参考下方支持的字段）。
        </p>
        <blockquote class="layui-elem-quote layui-text" style="margin-top: 10px;">
            支持的列名（表头）：name (必填), gender (1男/0女), ethnicity, native_place, title, birthday_solar, birthday_lunar, id_card, location, address, remark
        </blockquote>
    </div>

    <div class="upload-area" id="dropZone">
        <i class="layui-icon layui-icon-upload-drag" style="font-size: 50px; color: #009688;"></i>
        <p style="margin-top: 10px; font-size: 16px;">点击选择 或 将 Excel 文件拖拽到此处</p>
        <input type="file" id="fileInput" accept=".xlsx, .xls" style="display: none;">
    </div>
</div>

<div id="previewModal" style="display: none; padding: 20px;">
    <p style="color: #ff5722; margin-bottom: 10px;"><i class="layui-icon layui-icon-tips"></i> 请检查下方解析出的数据，确认无误后点击下方按钮写入数据库。</p>
    <div class="preview-table-container">
        <table class="layui-table" lay-size="sm">
            <thead>
                <tr id="tableHeader"></tr>
            </thead>
            <tbody id="tableBody"></tbody>
        </table>
    </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/layui/2.9.24/layui.js"></script>
<script>
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    let parsedData = []; // 暂存解析出的数据

    dropZone.addEventListener('click', () => fileInput.click());
    
    // 拖拽支持
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    // 上传文件并请求后端解析
    function handleFile(file) {
        const formData = new FormData();
        formData.append('excel', file);

        const loadIndex = layer.load(2); // 开启加载层

        fetch('/api/batch/parse', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(res => {
            layer.close(loadIndex);
            if (!res.success) {
                return layer.alert(res.message, { icon: 2, title: '错误' });
            }
            
            parsedData = res.data;
            openConfirmModal(res.data);
        })
        .catch(err => {
            layer.close(loadIndex);
            layer.alert('文件解析失败，请检查文件格式', { icon: 2 });
        });
    }

    // 弹出确认框并渲染数据表格
    function openConfirmModal(data) {
        if (data.length === 0) {
            return layer.msg('Excel 文件中没有有效数据');
        }

        // 动态渲染表头
        const headers = Object.keys(data[0]);
        document.getElementById('tableHeader').innerHTML = headers.map(h => \`<th>\${h}</th>\`).join('');

        // 动态渲染数据行
        let bodyHtml = '';
        data.forEach(row => {
            bodyHtml += '<tr>';
            headers.forEach(h => {
                bodyHtml += \`<td>\${row[h] !== undefined ? row[h] : ''}</td>\`;
            });
            bodyHtml += '</tr>';
        });
        document.getElementById('tableBody').innerHTML = bodyHtml;

        // 弹出 Layer 确认窗口
        layer.open({
            type: 1,
            title: \`请确认导入数据 (共 \${data.length} 条记录)\`,
            area: ['90%', '80%'],
            content: layui.$('#previewModal'),
            btn: ['确认导入', '取消'],
            yes: function(index) {
                submitDataToServer(index);
            },
            end: function() {
                fileInput.value = ''; // 清空 file input
            }
        });
    }

    // 将确认后的数据提交至入库接口
    function submitDataToServer(modalIndex) {
        const loadIndex = layer.load(1);
        
        fetch('/api/batch/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: parsedData })
        })
        .then(res => res.json())
        .then(res => {
            layer.close(loadIndex);
            if (res.success) {
                layer.close(modalIndex); // 关闭预览弹窗
                layer.alert(\`成功导入 \${res.count} 条联系人数据！\`, { icon: 1, title: '成功' });
            } else {
                layer.alert('导入失败：' + res.message, { icon: 2 });
            }
        })
        .catch(err => {
            layer.close(loadIndex);
            layer.alert('请求服务器失败', { icon: 2 });
        });
    }
</script>
</body>
</html>
    `);
});

// ==========================================
// 2. 后端接口一：接收 Excel 并解析为 JSON 返回给前端
// ==========================================
app.post('/api/batch/parse', upload.single('excel'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, message: '未检测到上传的文件' });
        }

        // 读取内存中的 Excel 缓冲数据
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 将 Excel 转换为 JSON 对象数组
        const rawData = xlsx.utils.sheet_to_json(worksheet);

        // 过滤和简单校验：过滤掉没有填写 name 的空行
        const validData = rawData.filter(item => item.name || item.姓名);

        // 标准化字段名 (兼容中文表头和英文表头映射)
        const mappedData = validData.map(item => {
            return {
                name: String(item.name || item.姓名 || '').trim(),
                gender: item.gender !== undefined ? item.gender : (item.性别 === '男' ? 1 : (item.性别 === '女' ? 0 : null)),
                face_uuid: item.face_uuid || null,
                ethnicity: item.ethnicity || item.民族 || null,
                native_place: item.native_place || item.籍贯 || null,
                title: item.title || item.职位 || item.头衔 || null,
                birthday_solar: String(item.birthday_solar || item.阳历生日 || ''),
                birthday_lunar: String(item.birthday_lunar || item.阴历生日 || ''),
                deathday: String(item.deathday || item.死亡日期 || ''),
                id_card: String(item.id_card || item.身份证 || ''),
                location: item.location || item.所在地 || null,
                address: item.address || item.详细地址 || null,
                extra: item.extra || null,
                remark: item.remark || item.备注 || ''
            };
        });

        res.json({ success: true, data: mappedData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '解析 Excel 发生内部错误: ' + error.message });
    }
});

// ==========================================
// 3. 后端接口二：用户点击确认后，批量写入 SQLite 数据库
// ==========================================
app.post('/api/batch/import', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) {
        return res.status(400).json({ success: false, message: '无效的数据格式' });
    }

    try {
        // 开启 SQL 事务提高批量插入效率并保证一致性
        await dbRun('BEGIN TRANSACTION');

        for (const contact of data) {
            if (!contact.name) continue;

            // 核心要求：ID 绝不由用户自主填入，此处由后端随机生成
            // 采用与你 contactController.js 一致的随机 ID 生成策略
            const autoGeneratedId = Math.random().toString(36).substring(2, 11).toUpperCase();

            await dbRun(`
                INSERT INTO contacts (
                    id, face_uuid, name, gender, ethnicity, native_place, title, 
                    birthday_solar, birthday_lunar, deathday, id_card, location, address, extra, remark
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                autoGeneratedId,
                contact.face_uuid,
                contact.name,
                contact.gender,
                contact.ethnicity,
                contact.native_place,
                contact.title,
                contact.birthday_solar,
                contact.birthday_lunar,
                contact.deathday,
                contact.id_card,
                contact.location,
                contact.address,
                contact.extra,
                contact.remark
            ]);
        }

        await dbRun('COMMIT');
        res.json({ success: true, count: data.length });
    } catch (error) {
        try { await dbRun('ROLLBACK'); } catch(e){}
        console.error('批量导入失败:', error);
        res.status(500).json({ success: false, message: '写入数据库失败: ' + error.message });
    }
});

// 启动 3009 临时端口服务
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 临时批量导入服务已就绪！`);
    console.log(`🔗 请在浏览器中访问: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});