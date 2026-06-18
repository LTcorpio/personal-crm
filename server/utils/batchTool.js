// require('dotenv').config();
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const { dbRun } = require('../config/database'); // 引入你现有的数据库连接

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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRM 联系人批量导入工具</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        /* 自定义滚动条样式 */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex items-center justify-center p-4 md:p-8">

<div class="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8 transition-all">
    <div class="flex items-center space-x-3 mb-6">
        <div class="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <i data-lucide="users" class="w-6 h-6"></i>
        </div>
        <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">CRM 联系人批量数据导入</h2>
            <p class="text-xs text-slate-500 mt-0.5">支持高效稳定的数据解析与事务级安全写入</p>
        </div>
    </div>
    
    <hr class="border-slate-100 mb-6">
    
    <div class="bg-slate-50 border border-slate-200/60 rounded-xl p-5 mb-6 text-sm leading-relaxed">
        <h4 class="font-semibold text-slate-900 flex items-center mb-2">
            <i data-lucide="info" class="w-4 h-4 text-indigo-500 mr-1.5"></i>使用说明
        </h4>
        <ul class="space-y-1.5 text-slate-600 pl-5 list-disc">
            <li>上传 Excel 文件（支持 <span class="font-mono font-medium text-indigo-600">.xlsx</span>, <span class="font-mono font-medium text-indigo-600">.xls</span> 格式）。</li>
            <li><strong class="text-slate-900">主键 ID 由系统自动生成</strong>，Excel 中无需包含（系统将自动忽略）ID 列。</li>
            <li>表头名称需与数据库字段严格对应，或参考下方支持的字段映射。</li>
        </ul>
        
        <div class="mt-4 pt-3 border-t border-slate-200/60">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">支持的列名（表头）</span>
            <div class="flex flex-wrap gap-1.5">
                <span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-xs rounded border border-indigo-100 font-semibold">name (必填)</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">gender (1男/0女)</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">ethnicity</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">native_place</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">title</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">birthday_solar</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">birthday_lunar</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">id_card</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">location</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">address</span>
                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded border border-slate-200">remark</span>
            </div>
        </div>
    </div>

    <div class="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/30 active:bg-indigo-50/50 rounded-2xl p-10 text-center cursor-pointer transition-all group" id="dropZone">
        <div class="w-14 h-14 bg-slate-100 group-hover:bg-indigo-100 text-slate-500 group-hover:text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors">
            <i data-lucide="upload-cloud" class="w-7 h-7"></i>
        </div>
        <p class="text-base font-medium text-slate-700 group-hover:text-slate-900">点击选择文件，或将 Excel 拖拽到此处</p>
        <p class="text-xs text-slate-400 mt-1">仅支持单个 Excel 文件，数据量建议不超过 5000 条</p>
        <input type="file" id="fileInput" accept=".xlsx, .xls" class="hidden">
    </div>
</div>

<div id="previewModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 opacity-0 pointer-events-none transition-opacity duration-300">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col scale-95 transform transition-transform duration-300 overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div class="flex items-center space-x-2">
                <i data-lucide="database" class="w-5 h-5 text-indigo-600"></i>
                <h3 class="text-lg font-bold text-slate-900" id="modalTitle">请确认导入数据</h3>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>
        
        <div class="p-6 overflow-y-auto flex-1 custom-scrollbar">
            <div class="flex items-start space-x-2.5 bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-xl text-sm mb-4">
                <i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5"></i>
                <div>
                    <p class="font-medium">请严格核对解析出的数据结构！</p>
                    <p class="text-xs text-amber-700/90 mt-0.5">确认无误后点击下方按钮写入数据库。未正确识别的列将被填入系统默认空值。</p>
                </div>
            </div>
            
            <div class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="overflow-x-auto custom-scrollbar max-h-[45vh]">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr id="tableHeader" class="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold sticky top-0 z-10">
                                </tr>
                        </thead>
                        <tbody id="tableBody" class="divide-y divide-slate-100 text-slate-600">
                            </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-3">
            <button onclick="closeModal()" class="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">取消</button>
            <button id="btnConfirmImport" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 active:bg-indigo-800 shadow-sm shadow-indigo-200 transition-all flex items-center">
                <i data-lucide="check" class="w-4 h-4 mr-1.5"></i> 确认导入
            </button>
        </div>
    </div>
</div>

<div id="loadingOverlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex flex-col items-center justify-center opacity-0 pointer-events-none transition-opacity duration-200">
    <div class="bg-white p-5 rounded-2xl shadow-xl flex flex-col items-center space-y-3 border border-slate-100">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-sm font-medium text-slate-700" id="loadingText">正在处理中...</p>
    </div>
</div>

<div id="toastContainer" class="fixed top-5 right-5 z-50 flex flex-col space-y-3 pointer-events-none"></div>


<script>
    // 初始化 Lucide 图标
    lucide.createIcons();

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    let parsedData = []; // 暂存解析出的数据

    dropZone.addEventListener('click', () => fileInput.click());
    
    // 拖拽高亮交互
    dropZone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50/30');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/30');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/30');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    // 控制全局加载状态
    function showLoading(text = '正在处理中...') {
        document.getElementById('loadingText').innerText = text;
        const loader = document.getElementById('loadingOverlay');
        loader.classList.remove('opacity-0', 'pointer-events-none');
    }
    function hideLoading() {
        const loader = document.getElementById('loadingOverlay');
        loader.classList.add('opacity-0', 'pointer-events-none');
    }

    // 轻量级自定义 Toast 提示
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = \`flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-xl bg-white border pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 text-sm font-medium max-w-sm \${
            type === 'success' ? 'border-emerald-100 text-emerald-800' : 'border-rose-100 text-rose-800'
        }\`;
        
        const icon = type === 'success' ? 'check-circle' : 'x-circle';
        const iconColor = type === 'success' ? 'text-emerald-500' : 'text-rose-500';
        
        toast.innerHTML = \`<i data-lucide="\${icon}" class="w-5 h-5 \${iconColor} shrink-0"></i><span>\${message}</span>\`;
        container.appendChild(toast);
        lucide.createIcons({ attrs: { class: ['shrink-0'] } });

        // 动画入场
        setTimeout(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        }, 10);

        // 自动隐藏
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-[-4px]');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // 模态弹窗控制
    function openModal() {
        const modal = document.getElementById('previewModal');
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('.transform').classList.remove('scale-95');
    }
    function closeModal() {
        const modal = document.getElementById('previewModal');
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('.transform').classList.add('scale-95');
        fileInput.value = ''; // 清空 file input
    }

    // 上传文件并请求后端解析
    function handleFile(file) {
        const formData = new FormData();
        formData.append('excel', file);

        showLoading('正在深度解析 Excel 数据...');

        fetch('/api/batch/parse', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(res => {
            hideLoading();
            if (!res.success) {
                return showToast(res.message, 'error');
            }
            parsedData = res.data;
            openConfirmModal(res.data);
        })
        .catch(err => {
            hideLoading();
            showToast('文件解析失败，请检查文件格式是否标准', 'error');
        });
    }

    // 弹出确认框并渲染数据表格
    function openConfirmModal(data) {
        if (data.length === 0) {
            return showToast('Excel 文件中没有检测到有效数据数据行', 'error');
        }

        document.getElementById('modalTitle').innerText = \`确认导入数据 (共 \${data.length} 条有效记录)\`;

        // 动态渲染表头
        const headers = Object.keys(data[0]);
        document.getElementById('tableHeader').innerHTML = headers.map(h => \`<th class="px-4 py-3 font-semibold text-slate-700 bg-slate-50 border-b border-slate-200">\${h}</th>\`).join('');

        // 动态渲染数据行
        let bodyHtml = '';
        data.forEach(row => {
            bodyHtml += '<tr class="hover:bg-slate-50/80 transition-colors">';
            headers.forEach(h => {
                const val = row[h] !== undefined && row[h] !== null ? row[h] : '';
                bodyHtml += \`<td class="px-4 py-2.5 border-b border-slate-100 text-slate-600 truncate max-w-[160px]" title="\${val}">\${val}</td>\`;
            });
            bodyHtml += '</tr>';
        });
        document.getElementById('tableBody').innerHTML = bodyHtml;

        // 配置确认导入按钮事件
        document.getElementById('btnConfirmImport').onclick = function() {
            submitDataToServer();
        };

        openModal();
    }

    // 将确认后的数据提交至入库接口
    function submitDataToServer() {
        showLoading('正在写入 SQLite 数据库，请勿关闭页面...');
        
        fetch('/api/batch/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: parsedData })
        })
        .then(res => res.json())
        .then(res => {
            hideLoading();
            if (res.success) {
                closeModal(); // 关闭预览弹窗
                // 延迟一会弹提示，体验更好
                setTimeout(() => {
                    showToast(\`成功导入 \${res.count} 条联系人数据！\`, 'success');
                }, 100);
            } else {
                showToast('导入失败：' + res.message, 'error');
            }
        })
        .catch(err => {
            hideLoading();
            showToast('请求服务器失败', 'error');
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