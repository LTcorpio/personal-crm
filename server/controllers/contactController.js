const { db, dbQuery, dbRun } = require('../config/database');
const axios = require('axios');

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

// 1. 创建或更新联系人（加入精确差异比对，无修改不刷时间戳）
exports.saveContact = async (req, res) => {
    const data = req.body;
    const contactId = data.id;
    
    try {
        let isExisting = false;
        let mainFieldsChanged = false;
        let existingRows = [];
        let formerNamesRows = [];
        let methodsRows = [];
        let relationsRows = [];
        let oldTagIds = [];
        let tagPaths = [];

        // === 1. 幂等与差异检查：如果传了 id，先检查数据是否真正发生了改变 ===
        if (contactId) {
            existingRows = await dbQuery(`SELECT * FROM contacts WHERE id = ?`, [contactId]);
            if (existingRows.length > 0) {
                isExisting = true;
                const c = existingRows[0];

                // 并行或顺序查出该人员当前所有的子表数据
                formerNamesRows = await dbQuery(`SELECT name FROM former_names WHERE contact_id = ?`, [contactId]);
                methodsRows = await dbQuery(`SELECT type, value FROM contact_methods WHERE contact_id = ?`, [contactId]);
                // 此处获取自增主键 id 作为 pk，方便后续精准更新
                relationsRows = await dbQuery(`
                    SELECT id as pk, related_contact_id as id, related_name as name, relation, remark, sort_order 
                    FROM contact_relations 
                    WHERE contact_id = ? 
                    ORDER BY sort_order ASC
                `, [contactId]);
                
                const currentContactTags = await dbQuery(`SELECT tag_id FROM contact_tags WHERE contact_id = ?`, [contactId]);
                oldTagIds = currentContactTags.map(row => row.tag_id);
                
                tagPaths = await getFullTagPaths(contactId);

                // 规范化老数据结构
                const oldContactMethods = { wechat: "", qq: "", email: "", tel: "", tiktok: "" };
                methodsRows.forEach(m => {
                    if (m.type in oldContactMethods) oldContactMethods[m.type] = m.value || "";
                });

                const oldSnapshot = {
                    face_uuid: c.face_uuid || "",
                    name: c.name || "",
                    gender: c.gender !== null && c.gender !== undefined ? String(c.gender) : "",
                    ethnicity: c.ethnicity || "",
                    native_place: c.native_place || "",
                    title: c.title || "",
                    birthday_solar: c.birthday_solar || "",
                    birthday_lunar: c.birthday_lunar || "",
                    deathday: c.deathday || "",
                    id_card: c.id_card || "",
                    location: c.location || "",
                    address: c.address || "",
                    extra: c.extra || "",
                    remark: c.remark || "",
                    former_name: formerNamesRows.map(f => String(f.name)),
                    contact: oldContactMethods,
                    related: relationsRows.map(r => ({
                        id: r.id || "",
                        name: r.name || "",
                        relation: r.relation || "",
                        remark: r.remark || ""
                    })),
                    tag: tagPaths.map(String),
                };

                // 规范化前端传来的新数据结构（补齐缺省值，防止因 undefined 或空字段误判为变动）
                const newContactMethods = { wechat: "", qq: "", email: "", tel: "", tiktok: "" };
                if (data.contact && typeof data.contact === 'object') {
                    Object.keys(newContactMethods).forEach(k => {
                        newContactMethods[k] = data.contact[k] || "";
                    });
                }

                const newSnapshot = {
                    face_uuid: data.face_uuid || "",
                    name: data.name || "",
                    gender: data.gender !== null && data.gender !== undefined ? String(data.gender) : "",
                    ethnicity: data.ethnicity || "",
                    native_place: data.native_place || "",
                    title: data.title || "",
                    birthday_solar: data.birthday_solar || "",
                    birthday_lunar: data.birthday_lunar || "",
                    deathday: data.deathday || "",
                    id_card: data.id_card || "",
                    location: data.location || "",
                    address: data.address || "",
                    extra: data.extra || "",
                    remark: data.remark || "",
                    former_name: (data.former_name || []).filter(Boolean).map(String),
                    contact: newContactMethods,
                    related: (data.related || []).map(r => ({
                        id: r.id || r.contactId || "", // 兼容前端可能传入的 contactId
                        name: r.name || "",
                        relation: r.relation || "",
                        remark: r.remark || ""
                    })),
                    tag: (data.tag || []).filter(Boolean).map(t => String(t).trim())
                };

                // 深度核心比对：如果字符串化后完全一致，说明用户未做任何修改，直接无视并返回成功
                if (JSON.stringify(oldSnapshot) === JSON.stringify(newSnapshot)) {
                    return res.json({ success: true, message: "资料未发生变更，无需保存", id: contactId });
                }

                // 检查主表核心文本字段是否发生实质性变动
                const oldGenderStr = c.gender !== null && c.gender !== undefined ? String(c.gender) : "";
                const newGenderStr = data.gender !== null && data.gender !== undefined ? String(data.gender) : "";
                
                mainFieldsChanged = 
                    (c.face_uuid || "") !== (data.face_uuid || "") ||
                    (c.name || "") !== (data.name || "") ||
                    oldGenderStr !== newGenderStr ||
                    (c.ethnicity || "") !== (data.ethnicity || "") ||
                    (c.native_place || "") !== (data.native_place || "") ||
                    (c.title || "") !== (data.title || "") ||
                    (c.birthday_solar || "") !== (data.birthday_solar || "") ||
                    (c.birthday_lunar || "") !== (data.birthday_lunar || "") ||
                    (c.deathday || "") !== (data.deathday || "") ||
                    (c.id_card || "") !== (data.id_card || "") ||
                    (c.location || "") !== (data.location || "") ||
                    (c.address || "") !== (data.address || "") ||
                    (c.extra || "") !== (data.extra || "") ||
                    (c.remark || "") !== (data.remark || "");
            }
        }

        // === 2. 实质性写入：数据确认有改变或为全新数据，执行数据库写入 ===
        const finalContactId = contactId || Math.random().toString(36).substring(2, 11).toUpperCase();
        
        await dbRun('BEGIN TRANSACTION');

        if (!isExisting) {
            // 全新录入：直接插入主表
            await dbRun(`
                INSERT INTO contacts (id, face_uuid, name, gender, ethnicity, native_place, title, birthday_solar, birthday_lunar, deathday, id_card, location, address, extra, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                finalContactId, data.face_uuid || null, data.name, data.gender, data.ethnicity || null,
                data.native_place || null, data.title || null, data.birthday_solar || null,
                data.birthday_lunar || null, data.deathday || null, data.id_card || null, data.location || null,
                data.address || null, data.extra || '', data.remark || ''
            ]);
        } else if (mainFieldsChanged) {
            // 已有记录且主表核心字段有变动：更新主表并刷新 updated_at
            await dbRun(`
                UPDATE contacts SET
                    face_uuid=?, name=?, gender=?, ethnicity=?, native_place=?, title=?, 
                    birthday_solar=?, birthday_lunar=?, deathday=?, id_card=?, location=?, 
                    address=?, extra=?, remark=?, updated_at=CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                data.face_uuid || null, data.name, data.gender, data.ethnicity || null,
                data.native_place || null, data.title || null, data.birthday_solar || null,
                data.birthday_lunar || null, data.deathday || null, data.id_card || null, data.location || null,
                data.address || null, data.extra || '', data.remark || '', finalContactId
            ]);
        } // 注：如果仅仅修改了电话或标签，此处将完全略过主表更新，主表 updated_at 保持不变。

        // 曾用名：全清后按新顺序重新插入，以保持拖拽后的物理顺序
        const newNames = (data.former_name || []).filter(Boolean).map(String);
        await dbRun(`DELETE FROM former_names WHERE contact_id = ?`, [finalContactId]);
        for (const name of newNames) {
            await dbRun(`INSERT INTO former_names (contact_id, name) VALUES (?, ?)`, [finalContactId, name]);
        }

        // 联系方式：精准子项比对与按需单条更新
        const oldContactMethods = { wechat: "", qq: "", email: "", tel: "", tiktok: "" };
        methodsRows.forEach(m => {
            if (m.type in oldContactMethods) oldContactMethods[m.type] = m.value || "";
        });
        const newContactMethods = { wechat: "", qq: "", email: "", tel: "", tiktok: "" };
        if (data.contact && typeof data.contact === 'object') {
            Object.keys(newContactMethods).forEach(k => {
                newContactMethods[k] = data.contact[k] || "";
            });
        }

        for (const type of Object.keys(newContactMethods)) {
            const oldVal = oldContactMethods[type];
            const newVal = newContactMethods[type];
            if (oldVal !== newVal) {
                if (newVal === "") {
                    // 新置空，说明删除了该项
                    await dbRun(`DELETE FROM contact_methods WHERE contact_id = ? AND type = ?`, [finalContactId, type]);
                } else if (oldVal === "") {
                    // 老值为空，说明是新增
                    await dbRun(`INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)`, [finalContactId, type, newVal]);
                } else {
                    // 两者都不为空且不相等，说明只是单条修改，更新单条并刷新该子项的 updated_at
                    await dbRun(`UPDATE contact_methods SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ? AND type = ?`, [newVal, finalContactId, type]);
                }
            }
        }

        // 关联人关系：根据复合键作实体比对，并依据关联主键精准更新
        const oldRelationsMap = new Map();
        relationsRows.forEach(r => {
            const key = `${r.id || ''}\t${r.name || ''}\t${r.relation || ''}`;
            oldRelationsMap.set(key, r);
        });

        const newRelations = (data.related || []).map((r, index) => ({
            id: r.id || r.contactId || "",
            name: r.name || "",
            relation: r.relation || "",
            remark: r.remark || "",
            sort_order: index
        }));
        const newRelationsKeys = new Set(newRelations.map(r => `${r.id}\t${r.name}\t${r.relation}`));

        // 移除多余的关联
        for (const [key, oldRow] of oldRelationsMap.entries()) {
            if (!newRelationsKeys.has(key)) {
                await dbRun(`DELETE FROM contact_relations WHERE id = ?`, [oldRow.pk]);
            }
        }
        // 按需新增或单独更新单条备注
        for (const newRel of newRelations) {
            const key = `${newRel.id}\t${newRel.name}\t${newRel.relation}`;
            if (oldRelationsMap.has(key)) {
                const oldRow = oldRelationsMap.get(key);
                // 只要备注变了，或者在前端的拖动排序（sort_order）变了，就执行更新
                if ((oldRow.remark || "") !== newRel.remark || oldRow.sort_order !== newRel.sort_order) {
                    await dbRun(`
                        UPDATE contact_relations 
                        SET remark = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `, [newRel.remark || '', newRel.sort_order, oldRow.pk]);
                }
            } else {
                // 全新关联项，正常插入排序权重
                await dbRun(`
                    INSERT INTO contact_relations (contact_id, related_contact_id, related_name, relation, remark, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [finalContactId, newRel.id || null, newRel.name, newRel.relation, newRel.remark || '', newRel.sort_order]);
            }
        }

        // 标签：精准关联差异计算
        const newTagIds = [];
        if (data.tag && Array.isArray(data.tag)) {
            for (const tagPath of data.tag) {
                const leafTagId = await ensureTagPath(tagPath);
                if (leafTagId) newTagIds.push(leafTagId);
            }
        }
        // 标签全清全交
        await dbRun(`DELETE FROM contact_tags WHERE contact_id = ?`, [finalContactId]);
        for (const tagId of newTagIds) {
            await dbRun(`INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`, [finalContactId, tagId]);
        }

        await dbRun('COMMIT');
        res.json({ success: true, message: "保存成功", id: finalContactId });
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
            const { fields } = req.query;
            const allowedFields = [
                'name', 'title', 'ethnicity', 'native_place', 'location', 
                'address', 'id_card', 'birthday_solar', 'birthday_lunar', 
                'deathday', 'extra', 'remark', 'former_name', 'contact', 'related'
            ];
            
            let targetFields = fields 
                ? fields.split(',').filter(f => allowedFields.includes(f))
                : allowedFields;

            if (targetFields.length === 0) targetFields = ['name'];

            const searchConditions = [];
            targetFields.forEach(field => {
                if (field === 'former_name') {
                    searchConditions.push(`EXISTS (SELECT 1 FROM former_names fn WHERE fn.contact_id = contacts.id AND fn.name LIKE ?)`);
                    params.push(`%${search}%`);
                } else if (field === 'contact') {
                    searchConditions.push(`EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.contact_id = contacts.id AND cm.value LIKE ?)`);
                    params.push(`%${search}%`);
                } else if (field === 'related') {
                    searchConditions.push(`EXISTS (SELECT 1 FROM contact_relations cr WHERE cr.contact_id = contacts.id AND cr.related_name LIKE ?)`);
                    params.push(`%${search}%`);
                } else {
                    searchConditions.push(`contacts.${field} LIKE ?`);
                    params.push(`%${search}%`);
                }
            });
            sql += ` AND (${searchConditions.join(' OR ')})`;
        }

        if (tag) {
            sql += ` AND id IN (
                SELECT contact_id FROM contact_tags WHERE tag_id IN (
                    SELECT id FROM tags WHERE name = ?
                )
            )`;
            params.push(tag);
        }
        
        if (!id) {
            sql += ` ORDER BY sort_order ASC`;
        }

        const contacts = await dbQuery(sql, params);
        const result = [];

        for (const c of contacts) {
            const formerNamesRows = await dbQuery(`SELECT name FROM former_names WHERE contact_id = ?`, [c.id]);
            const methodsRows = await dbQuery(`SELECT type, value FROM contact_methods WHERE contact_id = ?`, [c.id]);
            const contactMethods = { wechat: "", qq: "", email: "", tel: "", tiktok: "" };
            methodsRows.forEach(m => contactMethods[m.type] = m.value);

            const relationsRows = await dbQuery(`
                SELECT related_contact_id as id, related_name as name, relation, remark 
                FROM contact_relations 
                WHERE contact_id = ? 
                ORDER BY sort_order ASC
            `, [c.id]);
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
                relationship: tagPaths.filter(p => p.startsWith("关系/")).map(p => p.split('/').pop()),
                birthday_solar: c.birthday_solar || "",
                birthday_lunar: c.birthday_lunar || "",
                deathday: c.deathday || "",
                id_card: c.id_card || "",
                location: c.location || "",
                address: c.address || "",
                contact: contactMethods,
                related: relationsRows.map(r => ({...r, id: r.id || ""})),
                extra: c.extra,
                remark: c.remark,
                created_at: c.created_at,
                updated_at: c.updated_at
            });
        }

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

// 4. 获取多层级标签树结构
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
    const { tagIds } = req.body;
    if (!Array.isArray(tagIds)) {
        return res.status(400).json({ success: false, message: "参数异常，tagIds 必须为数组" });
    }
    try {
        await dbRun('BEGIN TRANSACTION');
        for (const [index, id] of tagIds.entries()) {
            await dbRun(`UPDATE tags SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [index, id]);
        }
        await dbRun('COMMIT');
        res.json({ success: true, message: "标签排序更新成功" });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error("更新标签排序失败:", error);
        res.status(500).json({ success: false, message: "后端排序保存失败" });
    }
};

// 安全级联删除标签
exports.deleteTag = async (req, res) => {
    const { id } = req.params;
    try {
        const allTags = await dbQuery(`SELECT id, parent_id FROM tags`);
        const targetTagIds = [];
        
        const recurseCollect = (currentId) => {
            targetTagIds.push(Number(currentId));
            allTags.filter(t => t.parent_id === Number(currentId)).forEach(t => recurseCollect(t.id));
        };
        recurseCollect(id);

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

        await dbRun(`DELETE FROM tags WHERE id = ?`, [id]);
        res.json({ success: true, message: "标签及相关子层级已安全移除" });
    } catch (error) {
        console.error("删除标签失败:", error);
        res.status(500).json({ success: false, message: "服务器内部删除失败" });
    }
};

async function getTopicsWithMembers(topicId = null) {
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

// 精准重构分类成员变动逻辑，使用记录自身的自增主键 id 作差异比对
async function replaceTopicMembers(topicId, members = []) {
    // 1. 获取当前数据库中该主题已存在的所有成员记录
    const oldMembers = await dbQuery(`SELECT id as pk, contact_id, name, sort_order, remark FROM contact_topic_members WHERE topic_id = ?`, [topicId]);
    
    // 2. 规范化前端传入的数据，同时强转 String 避免数字类型调用 .trim() 发生报错
    const newMembers = members.map((member, index) => {
        const name = (member.name || '').trim();
        const contactId = String(member.contactId || '').trim(); 
        const remark = (member.remark || '').trim();
        return { 
            id: member.id ? Number(member.id) : null, // 对应关系表记录的物理主键 pk
            name, 
            contactId: contactId || null, 
            sort_order: index, 
            remark 
        };
    }).filter(m => m.name);

    // 3. 建立老数据的主键映射表，以及新数据的主键集合
    const oldMembersMap = new Map(oldMembers.map(m => [m.pk, m]));
    const newMembersIds = new Set(newMembers.map(m => m.id).filter(Boolean));

    // 4. 差异化删除：如果老记录的物理主键不在前端传回的集合里，说明该成员已被彻底移除
    for (const oldRow of oldMembers) {
        if (!newMembersIds.has(oldRow.pk)) {
            await dbRun(`DELETE FROM contact_topic_members WHERE id = ?`, [oldRow.pk]);
        }
    }

    // 5. 精准更新或按需新增
    for (const newMem of newMembers) {
        if (newMem.id && oldMembersMap.has(newMem.id)) {
            // 情况 A：物理记录存在，在原记录上精准修改（涵盖了绑定 ID、改名字、改备注或换排序）
            const oldRow = oldMembersMap.get(newMem.id);
            if (
                oldRow.contact_id !== newMem.contactId ||
                oldRow.name !== newMem.name ||
                oldRow.sort_order !== newMem.sort_order ||
                (oldRow.remark || '') !== newMem.remark
            ) {
                await dbRun(`
                    UPDATE contact_topic_members 
                    SET contact_id = ?, name = ?, sort_order = ?, remark = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `, [newMem.contactId, newMem.name, newMem.sort_order, newMem.remark, newMem.id]);
            }
        } else {
            // 情况 B：没有主键，判定为完全新增的成员
            await dbRun(`
                INSERT INTO contact_topic_members (topic_id, contact_id, name, sort_order, remark)
                VALUES (?, ?, ?, ?, ?)
            `, [topicId, newMem.contactId, newMem.name, newMem.sort_order, newMem.remark]);
        }
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

        const existingTopic = await dbQuery(`SELECT name, color FROM contact_topics WHERE id = ?`, [id]);
        if (existingTopic.length > 0) {
            const t = existingTopic[0];
            // 只有主题自身属性变化时，才调整主题表的 updated_at
            if (t.name !== topicName || t.color !== color) {
                await dbRun(`
                    UPDATE contact_topics
                    SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [topicName, color, id]);
            }
        }

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

// 9. Immich 缩略图 network 代理
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
    const { topicIds } = req.body;
    if (!Array.isArray(topicIds)) {
        return res.status(400).json({ success: false, message: "参数错误" });
    }
    try {
        await dbRun('BEGIN TRANSACTION');
        for (const [index, id] of topicIds.entries()) {
            await dbRun(`UPDATE contact_topics SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [index, id]);
        }
        await dbRun('COMMIT');
        res.json({ success: true, message: "排序更新成功" });
    } catch (error) {
        await dbRun('ROLLBACK');
        res.status(500).json({ success: false, message: "排序更新失败" });
    }
};

// 11. 修改标签名称
exports.updateTag = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const tagName = (name || '').trim();

    if (!tagName) {
        return res.status(400).json({ success: false, message: "标签名称不能为空" });
    }

    try {
        await dbRun(`UPDATE tags SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [tagName, id]);
        res.json({ success: true, message: "标签名称更新成功" });
    } catch (error) {
        console.error("更新标签失败:", error);
        res.status(500).json({ success: false, message: "服务器内部错误" });
    }
};

// 12. 更新所有人员全局排序序列
exports.updateContactsOrder = async (req, res) => {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds)) {
        return res.status(400).json({ success: false, message: "参数错误" });
    }
    try {
        await dbRun('BEGIN TRANSACTION');
        for (const [index, id] of contactIds.entries()) {
            await dbRun(`UPDATE contacts SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [index, id]);
        }
        await dbRun('COMMIT');
        res.json({ success: true, message: "人员顺序更新成功" });
    } catch (error) {
        await dbRun('ROLLBACK');
        console.error("更新人员序列失败:", error);
        res.status(500).json({ success: false, message: "人员顺序更新失败" });
    }
};