const { db, dbQuery, dbRun } = require('../config/database');
const axios = require('axios');
const { crypto } = require('crypto');

// 工具函数：递归或拼装全路径标签 (例如将 标签ID 转为 "同学/大学同学/智能1班")
async function getFullTagPaths(contactId) {
    const rows = await dbQuery(`
        SELECT t.id, t.name, t.parent_id FROM contact_tags ct
        JOIN tags t ON ct.tag_id = t.id
        WHERE ct.contact_id = ?
    `, [contactId]);

    const allTags = await dbQuery(`SELECT * FROM tags`);
    
    return rows.map(tag => {
        let path = tag.name;
        let curr = tag;
        while (curr.parent_id) {
            curr = allTags.find(t => t.id === curr.parent_id);
            if (!curr) break;
            path = curr.name + '/' + path;
        }
        return path;
    });
}

// 工具函数：确保多层级标签存在，并返回叶子节点 ID
async function ensureTagPath(pathStr) {
    const parts = pathStr.split('/').map(p => p.trim()).filter(Boolean);
    let parentId = null;
    
    for (const part of parts) {
        let row = await dbQuery(`SELECT id FROM tags WHERE name = ? AND (parent_id = ? OR (? IS NULL AND parent_id IS NULL))`, [part, parentId, parentId]);
        if (row.length > 0) {
            parentId = row[0].id;
        } else {
            const res = await dbRun(`INSERT INTO tags (name, parent_id) VALUES (?, ?)`, [part, parentId]);
            parentId = res.lastID;
        }
    }
    return parentId;
}

// 1. 创建或更新联系人
exports.saveContact = async (req, res) => {
    const data = req.body;
    // 如果没有传 id 则视为新增，生成一个简单随机 ID
    const contactId = data.id || Math.random().toString(36).substring(2, 11).toUpperCase();
    
    try {
        // 使用 SQLite 事务保证数据一致性
        await dbRun('BEGIN TRANSACTION');

        // 插入或替换主表数据
        await dbRun(`
            INSERT INTO contacts (id, face_uuid, name, gender, ethnicity, native_place, title, birthday_solar, birthday_lunar, deathday, id_card, location, address, extra, remark)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                face_uuid=excluded.face_uuid, name=excluded.name, gender=excluded.gender, ethnicity=excluded.ethnicity, 
                native_place=excluded.native_place, title=excluded.title, birthday_solar=excluded.birthday_solar, 
                birthday_lunar=excluded.birthday_lunar, deathday=excluded.deathday, id_card=excluded.id_card, location=excluded.location, 
                address=excluded.address, extra=excluded.extra, remark=excluded.remark
        `, [
            contactId, data.face_uuid || null, data.name, data.gender, data.ethnicity || null,
            data.native_place || null, data.title || null, data.birthday_solar || null,
            data.birthday_lunar || null, data.deathday || null, data.id_card || null, data.location || null,
            data.address || null, data.extra || '', data.remark || ''
        ]);

        // 清理并重新插入曾用名
        await dbRun(`DELETE FROM former_names WHERE contact_id = ?`, [contactId]);
        if (data.former_name && Array.isArray(data.former_name)) {
            for (const name of data.former_name) {
                if(name) await dbRun(`INSERT INTO former_names (contact_id, name) VALUES (?, ?)`, [contactId, name]);
            }
        }

        // 清理并重新插入联系方式
        await dbRun(`DELETE FROM contact_methods WHERE contact_id = ?`, [contactId]);
        if (data.contact && typeof data.contact === 'object') {
            for (const [type, value] of Object.entries(data.contact)) {
                if (value) {
                    await dbRun(`INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)`, [contactId, type, value]);
                }
            }
        }

        // 清理并重新插入关联人
        await dbRun(`DELETE FROM contact_relations WHERE contact_id = ?`, [contactId]);
        if (data.related && Array.isArray(data.related)) {
            for (const rel of data.related) {
                await dbRun(`
                    INSERT INTO contact_relations (contact_id, related_contact_id, related_name, relation, remark)
                    VALUES (?, ?, ?, ?, ?)
                `, [contactId, rel.id || null, rel.name, rel.relation, rel.remark || '']);
            }
        }

        // 处理标签
        await dbRun(`DELETE FROM contact_tags WHERE contact_id = ?`, [contactId]);
        if (data.tag && Array.isArray(data.tag)) {
            for (const tagPath of data.tag) {
                const leafTagId = await ensureTagPath(tagPath);
                await dbRun(`INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`, [contactId, leafTagId]);
            }
        }

        await dbRun('COMMIT');
        res.json({ success: true, message: "保存成功", id: contactId });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error(error);
        res.status(500).json({ success: false, message: "服务器内部错误" });
    }
};

// 2. 获取联系人详情与列表（带关键字及标签筛选）
exports.getContacts = async (req, res) => {
    const { search, tag, id } = req.query;
    const host = req.get('host');

    try {
        let sql = `SELECT * FROM contacts WHERE 1=1`;
        let params = [];

        if (id) {
            sql += ` AND id = ?`;
            params.push(id);
        }
        if (search) {
            // 获取前端传过来的指定字段，例如 fields="name,remark"
            const { fields } = req.query;
            const allowedFields = [
                'name', 'title', 'ethnicity', 'native_place', 'location', 
                'address', 'id_card', 'birthday_solar', 'birthday_lunar', 
                'deathday', 'extra', 'remark', 'former_name', 'contact', 'related'
            ];
            
            let targetFields = fields 
                ? fields.split(',').filter(f => allowedFields.includes(f))
                : allowedFields;

            // 防御：如果前端传了不支持的空数组，降级为默认查 name
            if (targetFields.length === 0) targetFields = ['name'];

            // 遍历前端勾选的字段，动态构建 SQL 子句
            const searchConditions = [];
            targetFields.forEach(field => {
                if (field === 'former_name') {
                    // 曾用名子表查询
                    searchConditions.push(`EXISTS (SELECT 1 FROM former_names fn WHERE fn.contact_id = contacts.id AND fn.name LIKE ?)`);
                    params.push(`%${search}%`);
                } else if (field === 'contact') {
                    // 联系方式子表查询 (微信、QQ、手机等统一归为联系方式搜索)
                    searchConditions.push(`EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.contact_id = contacts.id AND cm.value LIKE ?)`);
                    params.push(`%${search}%`);
                } else if (field === 'related') {
                    // 关联人子表查询
                    searchConditions.push(`EXISTS (SELECT 1 FROM contact_relations cr WHERE cr.contact_id = contacts.id AND cr.related_name LIKE ?)`);
                    params.push(`%${search}%`);
                } else {
                    // 主表常规文本字段
                    searchConditions.push(`contacts.${field} LIKE ?`);
                    params.push(`%${search}%`);
                }
            });
            sql += ` AND (${searchConditions.join(' OR ')})`;
        }

        // 标签筛选逻辑：如果传入标签，过滤绑定该标签（或其子标签）的联系人
        if (tag) {
            sql += ` AND id IN (
                SELECT contact_id FROM contact_tags WHERE tag_id IN (
                    SELECT id FROM tags WHERE name = ?
                )
            )`;
            params.push(tag);
        }

        const contacts = await dbQuery(sql, params);
        const result = [];

        for (const c of contacts) {
            // 聚合曾用名
            const formerNamesRows = await dbQuery(`SELECT name FROM former_names WHERE contact_id = ?`, [c.id]);
            // 聚合联系方式
            const methodsRows = await dbQuery(`SELECT type, value FROM contact_methods WHERE contact_id = ?`, [c.id]);
            const contactMethods = { wechat: "", qq: "", email: "", tel: "", tiktok: "" };
            methodsRows.forEach(m => contactMethods[m.type] = m.value);

            // 聚合关联人
            const relationsRows = await dbQuery(`SELECT related_contact_id as id, related_name as name, relation, remark FROM contact_relations WHERE contact_id = ?`, [c.id]);
            
            // 获取标签全路径数组
            const tagPaths = await getFullTagPaths(c.id);

            result.push({
                id: c.id,
                face_thumb_url: c.face_uuid ? `http://${host}/api/proxy-face/${c.face_uuid}` : "",
                face_uuid: c.face_uuid || "",
                tag: tagPaths,
                name: c.name,
                former_name: formerNamesRows.map(f => f.name),
                gender: c.gender,
                ethnicity: c.ethnicity || "",
                native_place: c.native_place || "",
                title: c.title || "",
                relationship: tagPaths.filter(p => p.startsWith("关系/")).map(p => p.split('/').pop()), // 视情况提取关系
                birthday_solar: c.birthday_solar || "",
                birthday_lunar: c.birthday_lunar || "",
                deathday: c.deathday || "",
                id_card: c.id_card || "",
                location: c.location || "",
                address: c.address || "",
                contact: contactMethods,
                related: relationsRows.map(r => ({...r, id: r.id || ""})),
                extra: c.extra,
                remark: c.remark
            });
        }

        // 如果是查单个人直接返回对象，否则返回数组
        res.json(id ? (result[0] || null) : result);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "获取数据失败" });
    }
};

// 3. 删除联系人
exports.deleteContact = async (req, res) => {
    const { id } = req.params;
    try {
        await dbRun(`DELETE FROM contacts WHERE id = ?`, [id]);
        res.json({ success: true, message: "删除成功" });
    } catch (error) {
        res.status(500).json({ error: "删除失败" });
    }
};

// 4. 获取多层级标签树结构（供前端组件渲染）
exports.getTagTree = async (req, res) => {
    try {
        const allTags = await dbQuery(`SELECT * FROM tags ORDER BY sort_order ASC, id ASC`);
        
        const buildTree = (parentId) => {
            return allTags
                .filter(t => t.parent_id === parentId)
                .map(t => ({
                    id: t.id,
                    name: t.name,
                    children: buildTree(t.id)
                }));
        };

        const tree = buildTree(null);
        res.json(tree);
    } catch (error) {
        res.status(500).json({ error: "获取标签树失败" });
    }
};

exports.updateTagsOrder = async (req, res) => {
    const { tagIds } = req.body; // 接收当前层级排好序的 id 数组，如 [12, 5, 8]
    if (!Array.isArray(tagIds)) {
        return res.status(400).json({ success: false, message: "参数异常，tagIds 必须为数组" });
    }
    try {
        await dbRun('BEGIN TRANSACTION');
        for (const [index, id] of tagIds.entries()) {
            await dbRun(`UPDATE tags SET sort_order = ? WHERE id = ?`, [index, id]);
        }
        await dbRun('COMMIT');
        res.json({ success: true, message: "标签排序更新成功" });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error("更新标签排序失败:", error);
        res.status(500).json({ success: false, message: "后端排序保存失败" });
    }
};

// === 安全级联删除标签（严格限制已被关联绑定的数据） ===
exports.deleteTag = async (req, res) => {
    const { id } = req.params;
    try {
        // 1. 深度遍历查询：获取当前标签及其所有下属子标签的 ID 集合
        const allTags = await dbQuery(`SELECT id, parent_id FROM tags`);
        const targetTagIds = [];
        
        const recurseCollect = (currentId) => {
            targetTagIds.push(Number(currentId));
            allTags.filter(t => t.parent_id === Number(currentId)).forEach(t => recurseCollect(t.id));
        };
        recurseCollect(id);

        // 2. 检查人员关联关系：如果在这一棵子树中任意标签绑定了联系人，则禁止删除
        const placeholders = targetTagIds.map(() => '?').join(',');
        const checkRelation = await dbQuery(`
            SELECT COUNT(*) as count FROM contact_tags 
            WHERE tag_id IN (${placeholders})
        `, targetTagIds);

        if (checkRelation[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `由于该标签或子标签下仍绑定有联系人，无法删除，请先调整人员标签` 
            });
        }

        // 3. 安全删除：由于设置了外键约束 ON DELETE CASCADE，底层子标签会自动被级联清空
        await dbRun(`DELETE FROM tags WHERE id = ?`, [id]);
        res.json({ success: true, message: "标签及相关子层级已安全移除" });
    } catch (error) {
        console.error("删除标签失败:", error);
        res.status(500).json({ success: false, message: "服务器内部删除失败" });
    }
};

async function getTopicsWithMembers(topicId = null) {
    // 排序改为优先按新增的 sort_order 升序
    const sql = `SELECT id, name, color, sort_order, created_at, updated_at FROM contact_topics ${topicId ? 'WHERE id = ?' : ''} ORDER BY sort_order ASC, created_at DESC, id DESC`;
    const topics = await dbQuery(sql, topicId ? [topicId] : []);

    const result = [];
    for (const topic of topics) {
        const members = await dbQuery(`
            SELECT id, contact_id as contactId, name, sort_order as sortOrder, remark
            FROM contact_topic_members
            WHERE topic_id = ?
            ORDER BY sort_order ASC, id ASC
        `, [topic.id]);

        result.push({
            ...topic,
            members: members.map(m => ({
                id: m.id,
                contactId: m.contactId || "",
                name: m.name,
                sortOrder: m.sortOrder,
                remark: m.remark || ""
            }))
        });
    }

    return result;
}

async function replaceTopicMembers(topicId, members = []) {
    await dbRun(`DELETE FROM contact_topic_members WHERE topic_id = ?`, [topicId]);

    for (const [index, member] of members.entries()) {
        const name = (member.name || '').trim();
        const contactId = (member.contactId || member.id || '').trim();
        const remark = (member.remark || '').trim();

        if (!name) continue;

        await dbRun(`
            INSERT INTO contact_topic_members (topic_id, contact_id, name, sort_order, remark)
            VALUES (?, ?, ?, ?, ?)
        `, [topicId, contactId || null, name, index, remark]);
    }
}

// 5. 获取主题列表
exports.getTopics = async (req, res) => {
    try {
        res.json(await getTopicsWithMembers());
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "获取主题失败" });
    }
};

// 6. 新增主题
exports.createTopic = async (req, res) => {
    const { name, color = '#ffffff', members = [] } = req.body;
    const topicName = (name || '').trim();

    if (!topicName) {
        return res.status(400).json({ success: false, message: "主题名称不能为空" });
    }

    try {
        await dbRun('BEGIN TRANSACTION');

        const insertResult = await dbRun(`
            INSERT INTO contact_topics (name, color) VALUES (?, ?)
        `, [topicName, color]);

        await replaceTopicMembers(insertResult.lastID, members);

        await dbRun('COMMIT');
        const topic = (await getTopicsWithMembers(insertResult.lastID))[0];
        res.json({ success: true, topic });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error(error);
        res.status(500).json({ success: false, message: "保存主题失败" });
    }
};

// 7. 更新主题
exports.updateTopic = async (req, res) => {
    const { id } = req.params;
    const { name, color = '#ffffff', members = [] } = req.body;
    const topicName = (name || '').trim();

    if (!topicName) {
        return res.status(400).json({ success: false, message: "主题名称不能为空" });
    }

    try {
        await dbRun('BEGIN TRANSACTION');

        await dbRun(`
            UPDATE contact_topics
            SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [topicName, color, id]);

        await replaceTopicMembers(id, members);

        await dbRun('COMMIT');
        const topic = (await getTopicsWithMembers(id))[0];
        res.json({ success: true, topic });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error(error);
        res.status(500).json({ success: false, message: "更新主题失败" });
    }
};

// 8. 删除主题
exports.deleteTopic = async (req, res) => {
    const { id } = req.params;

    try {
        await dbRun(`DELETE FROM contact_topics WHERE id = ?`, [id]);
        res.json({ success: true, message: "删除成功" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "删除主题失败" });
    }
};

// 9. Immich 缩略图网络代理
exports.proxyFaceImage = async (req, res) => {
    const { uuid } = req.params;
    const immichUrl = `${process.env.IMMICH_BASE_URL}/api/people/${uuid}/thumbnail`;

    try {
        const response = await axios({
            method: 'get',
            url: immichUrl,
            headers: { 'x-api-key': process.env.IMMICH_API_KEY },
            responseType: 'stream'
        });
        
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
        response.data.pipe(res);
    } catch (error) {
        console.error(`无法获取人脸图片 [${uuid}]:`, error.message);
        res.status(404).send('图片未找到或 Immich 服务未响应');
    }
};

// 10. 更新主题排序
exports.updateTopicsOrder = async (req, res) => {
    const { topicIds } = req.body; // 传入排好序的 id 数组，如 [3, 1, 2]
    if (!Array.isArray(topicIds)) {
        return res.status(400).json({ success: false, message: "参数错误" });
    }
    try {
        await dbRun('BEGIN TRANSACTION');
        for (const [index, id] of topicIds.entries()) {
            await dbRun(`UPDATE contact_topics SET sort_order = ? WHERE id = ?`, [index, id]);
        }
        await dbRun('COMMIT');
        res.json({ success: true, message: "排序更新成功" });
    } catch (error) {
        await dbRun('ROLLBACK');
        res.status(500).json({ success: false, message: "排序更新失败" });
    }
};