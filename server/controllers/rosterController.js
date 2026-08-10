const { rosterQuery, rosterRun } = require('../config/rosterDatabase');
const XLSX = require('xlsx');
const path = require('path');

// ==========================================
// 1. 解析上传的 Excel 文件（不落库，返回所有工作表的预览数据供用户确认）
// ==========================================
exports.parseRoster = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '请选择要上传的 Excel 文件' });
        }

        const filePath = req.file.path;

        // 读取工作簿，解析所有工作表
        const workbook = XLSX.readFile(filePath, { type: 'file' });
        const sheets = workbook.SheetNames.map((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];

            // sheet_to_json 默认对象模式，第一行作为表头键
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

            // 提取列名
            let columns = [];
            if (rows.length > 0) {
                columns = Object.keys(rows[0]);
            } else {
                // 空表情况：尝试从第一行单元格读取表头
                const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
                    const cell = worksheet[cellAddress];
                    columns.push(cell ? String(cell.v) : `列${col + 1}`);
                }
            }

            return {
                sheetName,
                sheetIndex: index,
                columns,
                rows,
                rowCount: rows.length,
            };
        });

        // 清理临时文件
        const fs = require('fs');
        fs.unlink(filePath, () => {});

        return res.json({
            success: true,
            data: { sheets }
        });
    } catch (error) {
        console.error('[名单解析] 失败:', error);
        return res.status(500).json({ success: false, message: 'Excel 文件解析失败: ' + error.message });
    }
};

// ==========================================
// 2. 确认导入：将用户确认后的数据持久化到 SQLite
// ==========================================
exports.saveRoster = async (req, res) => {
    const { name, columns, rows } = req.body;

    if (!name || !columns || !Array.isArray(columns) || !rows || !Array.isArray(rows)) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }

    try {
        // 1. 计算新名单的 sort_order（放在最后）
        const maxOrderRows = await rosterQuery(`SELECT MAX(sort_order) AS max_order FROM rosters`);
        const nextOrder = (maxOrderRows[0]?.max_order ?? -1) + 1;

        // 2. 插入名单元数据（不再保存原始文件名，避免乱码问题）
        const result = await rosterRun(
            `INSERT INTO rosters (name, original_filename, columns, row_count, sort_order) VALUES (?, ?, ?, ?, ?)`,
            [name, '', JSON.stringify(columns), rows.length, nextOrder]
        );
        const rosterId = result.lastID;

        // 3. 逐行插入数据（使用 Promise 链确保所有行写入完成后再响应）
        for (let i = 0; i < rows.length; i++) {
            const rowData = rows[i];
            const cleanRow = {};
            columns.forEach(col => {
                cleanRow[col] = rowData[col] !== undefined ? String(rowData[col]) : '';
            });
            await rosterRun(
                `INSERT INTO roster_rows (roster_id, row_index, data) VALUES (?, ?, ?)`,
                [rosterId, i, JSON.stringify(cleanRow)]
            );
        }

        return res.json({ success: true, data: { id: rosterId, rowCount: rows.length } });
    } catch (error) {
        console.error('[名单保存] 失败:', error);
        return res.status(500).json({ success: false, message: '保存失败: ' + error.message });
    }
};

// ==========================================
// 3. 获取所有名单元数据列表（不含行数据）
// ==========================================
exports.getRosters = async (req, res) => {
    try {
        const rosters = await rosterQuery(
            `SELECT id, name, original_filename, columns, row_count, sort_order, uploaded_at FROM rosters ORDER BY sort_order ASC, id ASC`
        );
        // 反序列化 columns
        const parsed = rosters.map(r => ({
            ...r,
            columns: JSON.parse(r.columns),
        }));
        return res.json({ success: true, data: parsed });
    } catch (error) {
        console.error('[名单列表] 查询失败:', error);
        return res.status(500).json({ success: false, message: '查询失败' });
    }
};

// ==========================================
// 3.1 重命名名单
// ==========================================
exports.renameRoster = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: '名单名称不能为空' });
    }
    try {
        await rosterRun(`UPDATE rosters SET name = ? WHERE id = ?`, [name.trim(), id]);
        return res.json({ success: true, message: '重命名成功' });
    } catch (error) {
        console.error('[名单重命名] 失败:', error);
        return res.status(500).json({ success: false, message: '重命名失败' });
    }
};

// ==========================================
// 3.2 调整名单显示顺序
//     请求体：{ rosterIds: [id1, id2, id3, ...] } 按新顺序排列的名单 ID
// ==========================================
exports.updateRostersOrder = async (req, res) => {
    const { rosterIds } = req.body;
    if (!Array.isArray(rosterIds) || rosterIds.length === 0) {
        return res.status(400).json({ success: false, message: '参数不完整' });
    }
    try {
        await rosterRun('BEGIN TRANSACTION');
        for (let i = 0; i < rosterIds.length; i++) {
            await rosterRun(`UPDATE rosters SET sort_order = ? WHERE id = ?`, [i, rosterIds[i]]);
        }
        await rosterRun('COMMIT');
        return res.json({ success: true, message: '顺序已更新' });
    } catch (error) {
        await rosterRun('ROLLBACK');
        console.error('[名单排序] 失败:', error);
        return res.status(500).json({ success: false, message: '排序失败' });
    }
};

// ==========================================
// 4. 获取单份名单的完整数据
// ==========================================
exports.getRosterById = async (req, res) => {
    const { id } = req.params;
    try {
        const rosters = await rosterQuery(
            `SELECT id, name, original_filename, columns, row_count, uploaded_at FROM rosters WHERE id = ?`,
            [id]
        );
        if (rosters.length === 0) {
            return res.status(404).json({ success: false, message: '名单不存在' });
        }
        const roster = rosters[0];
        roster.columns = JSON.parse(roster.columns);

        const rows = await rosterQuery(
            `SELECT row_index, data FROM roster_rows WHERE roster_id = ? ORDER BY row_index ASC`,
            [id]
        );
        roster.rows = rows.map(r => JSON.parse(r.data));

        return res.json({ success: true, data: roster });
    } catch (error) {
        console.error('[名单详情] 查询失败:', error);
        return res.status(500).json({ success: false, message: '查询失败' });
    }
};

// ==========================================
// 5. 删除一份名单
// ==========================================
exports.deleteRoster = async (req, res) => {
    const { id } = req.params;
    try {
        await rosterRun(`DELETE FROM roster_rows WHERE roster_id = ?`, [id]);
        await rosterRun(`DELETE FROM rosters WHERE id = ?`, [id]);
        return res.json({ success: true, message: '名单已删除' });
    } catch (error) {
        console.error('[名单删除] 失败:', error);
        return res.status(500).json({ success: false, message: '删除失败' });
    }
};

// ==========================================
// 6. 搜索 / 筛选：仅支持指定单份名单
//    查询参数：
//    - keyword: 关键字（在所有字段值中模糊匹配）
//    - rosterId: 必填，指定名单 ID
//    - filters: JSON 字符串，形如 { "列名": ["片段1", "片段2"] }
//      · 同一列内多个片段为 OR 关系（包含任意一个即命中）
//      · 不同列之间为 AND 关系（所有列条件都需满足）
//      · 参考 Excel 筛选逻辑：支持部分文字匹配 + 多项筛选
// ==========================================
exports.searchRosters = async (req, res) => {
    const { keyword, rosterId, filters } = req.query;
    const filterObj = filters ? JSON.parse(filters) : {};

    if (!rosterId) {
        return res.json({ success: true, data: [] });
    }

    try {
        const rosters = await rosterQuery(
            `SELECT id, name, original_filename, columns, row_count, uploaded_at FROM rosters WHERE id = ?`,
            [rosterId]
        );

        if (rosters.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const roster = rosters[0];
        roster.columns = JSON.parse(roster.columns);
        const rowRecords = await rosterQuery(
            `SELECT row_index, data FROM roster_rows WHERE roster_id = ? ORDER BY row_index ASC`,
            [roster.id]
        );
        let rows = rowRecords.map(r => JSON.parse(r.data));

        // 关键字模糊匹配：遍历所有字段值
        if (keyword && keyword.trim()) {
            const kw = keyword.trim().toLowerCase();
            rows = rows.filter(row =>
                Object.values(row).some(val =>
                    String(val).toLowerCase().includes(kw)
                )
            );
        }

        // 字段筛选：列内 OR（包含任意片段），列间 AND
        // filterObj 形如 { "姓名": ["张", "李"], "城市": ["北京"] }
        const activeFilterEntries = Object.entries(filterObj).filter(([, vals]) => {
            if (!vals) return false;
            if (Array.isArray(vals)) return vals.length > 0;
            return vals !== '' && vals !== null && vals !== undefined;
        });

        if (activeFilterEntries.length > 0) {
            rows = rows.filter(row =>
                activeFilterEntries.every(([col, vals]) => {
                    const cellVal = String(row[col] || '').toLowerCase();
                    // 统一为数组处理
                    const arr = Array.isArray(vals) ? vals : [vals];
                    // 列内 OR：包含任意一个片段即命中
                    return arr.some(v => cellVal.includes(String(v).toLowerCase()));
                })
            );
        }

        return res.json({
            success: true,
            data: [{
                id: roster.id,
                name: roster.name,
                columns: roster.columns,
                rows,
                matchedCount: rows.length,
            }]
        });
    } catch (error) {
        console.error('[名单搜索] 失败:', error);
        return res.status(500).json({ success: false, message: '搜索失败' });
    }
};

// ==========================================
// 7. 获取指定名单中某列的所有不重复值（用于筛选下拉选项）
// ==========================================
exports.getColumnValues = async (req, res) => {
    const { id } = req.params;
    const { column } = req.query;

    if (!column) {
        return res.status(400).json({ success: false, message: '请指定列名' });
    }

    try {
        const rowRecords = await rosterQuery(
            `SELECT data FROM roster_rows WHERE roster_id = ?`,
            [id]
        );
        const valueSet = new Set();
        rowRecords.forEach(r => {
            const row = JSON.parse(r.data);
            if (row[column] !== undefined && row[column] !== '') {
                valueSet.add(String(row[column]));
            }
        });
        return res.json({ success: true, data: Array.from(valueSet).sort() });
    } catch (error) {
        console.error('[列值查询] 失败:', error);
        return res.status(500).json({ success: false, message: '查询失败' });
    }
};
