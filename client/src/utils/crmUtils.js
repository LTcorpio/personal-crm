import { Tag } from "antd";

/**
 * 递归计算标签树节点的人数并注入 key 与 title
 */
export const enrichTreeWithCounts = (nodes, allContacts, parentPath = '') => {
  return nodes.map(node => {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

    // 计算属于该节点及其所有子孙节点的总人数
    const matchCount = allContacts.filter(c => 
      c.tag && c.tag.some(t => t === currentPath || t.startsWith(currentPath + '/'))
    ).length;

    // 递归处理子节点
    const children = node.children ? enrichTreeWithCounts(node.children, allContacts, currentPath) : [];

    return {
      ...node,
      key: currentPath, // 确保 Ant Design Tree 组件的 key 是全路径
      title: (<span className="font-bold text-black-700">
          {node.name} <Tag className="font-normal text-gray-400 text-xs">{matchCount}</Tag>
        </span>), 
      matchCount,
      children
    };
  });
};

/**
 * 前端综合搜索与标签过滤算法
 */
export const filterContacts = (contacts, searchTxt, searchFields, selectedTagPath) => {
  return contacts.filter(c => {
    // 1. 如果没有搜索关键词和标签，不过滤
    if (!searchTxt || !searchFields || searchFields.length === 0) {
      // 支持“无标签”筛选
      if (selectedTagPath === '__NO_TAGS__') {
        return !c.tag || c.tag.length === 0;
      }
      return !selectedTagPath || (c.tag && c.tag.some(t => t === selectedTagPath || t.startsWith(selectedTagPath + '/')));
    }

    // 2. 动态匹配选中的字段
    const matchesSearch = (
      (searchFields.includes('name') && c.name?.includes(searchTxt)) ||
      (searchFields.includes('title') && c.title?.includes(searchTxt)) ||
      (searchFields.includes('ethnicity') && c.ethnicity?.includes(searchTxt)) ||
      (searchFields.includes('native_place') && c.native_place?.includes(searchTxt)) ||
      (searchFields.includes('location') && c.location?.includes(searchTxt)) ||
      (searchFields.includes('address') && c.address?.includes(searchTxt)) ||
      (searchFields.includes('id_card') && c.id_card?.includes(searchTxt)) ||
      (searchFields.includes('birthday_solar') && c.birthday_solar?.includes(searchTxt)) ||
      (searchFields.includes('birthday_lunar') && c.birthday_lunar?.includes(searchTxt)) ||
      (searchFields.includes('deathday') && c.deathday?.includes(searchTxt)) ||
      (searchFields.includes('extra') && c.extra?.includes(searchTxt)) ||
      (searchFields.includes('remark') && c.remark?.includes(searchTxt)) ||
      (searchFields.includes('former_name') && c.former_name?.some(n => n.includes(searchTxt))) ||
      (searchFields.includes('contact') && c.contact && Object.values(c.contact).some(v => v?.includes(searchTxt))) ||
      (searchFields.includes('related') && c.related?.some(r => r.name?.includes(searchTxt)))
    );

    // 3. 标签路径匹配,支持“无标签”与搜索框词条联动筛选
    let matchesTag = true;
    if (selectedTagPath === '__NO_TAGS__') {
      matchesTag = !c.tag || c.tag.length === 0;
    } else if (selectedTagPath) {
      matchesTag = c.tag && c.tag.some(t => t === selectedTagPath || t.startsWith(selectedTagPath + '/'));
    }

    return matchesSearch && matchesTag;
  });
};

/**
 * 建立「联系人 ID → 所属主题数组」的映射，供各视图展示某人属于哪些主题。
 *
 * 口径与 CrmPage 里「按主题」筛选成员保持一致：只认成员显式绑定的 contactId，
 * 按姓名自由命名的成员（未匹配到联系人）不计入；同一人在同一主题里重复出现只算一次。
 *
 * @param {Array} topics 主题列表（含 members）
 * @returns {Map<string, Array>} key 为 String(contactId)，value 为主题数组（保持主题自身顺序）；
 *   数组每项是主题对象的浅拷贝，额外带 `memberRemark`＝「该成员在这个主题下的备注」（无则空串），
 *   供主题标签的悬浮提示使用；原始 topics 对象不被改动。
 */
export const buildContactTopicMap = (topics = []) => {
  const map = new Map();
  (topics || []).forEach(topic => {
    const seen = new Set();
    (topic?.members || []).forEach(member => {
      const cid = member?.contactId ? String(member.contactId) : '';
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid).push({ ...topic, memberRemark: String(member?.remark || '').trim() });
    });
  });
  return map;
};

/**
 * 按阳历生日计算周岁年龄。
 *
 * 兼容三种写法：YYYY-MM-DD / YYYY-MM / YYYY；缺月或缺日时按该段最早日期估算，
 * 并返回 isIncomplete=true 供展示侧提示「大致年龄」。有 deathday 时以 deathday 为基准
 * （即享年），否则以今天为基准。
 *
 * @returns {{age:number, isIncomplete:boolean}|null} 生日缺失或不可解析时返回 null
 */
export const calculateAge = (birthdayStr, deathdayStr) => {
  if (!birthdayStr) return null;

  const str = birthdayStr.trim();
  let normalizedDateStr = '';
  let isIncomplete = false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    normalizedDateStr = str;
  } else if (/^\d{4}-\d{2}$/.test(str)) {
    normalizedDateStr = `${str}-01`;
    isIncomplete = true;
  } else if (/^\d{4}$/.test(str)) {
    normalizedDateStr = `${str}-01-01`;
    isIncomplete = true;
  } else {
    return null;
  }

  const birthDate = new Date(normalizedDateStr);
  if (isNaN(birthDate.getTime())) return null;

  const endDate = deathdayStr ? new Date(deathdayStr.trim()) : new Date();
  if (isNaN(endDate.getTime())) return null;

  let age = endDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = endDate.getMonth() - birthDate.getMonth();

  // 只有完整日期才需要判断当年生日是否已过；缺失月/日时按估算处理
  if (!isIncomplete) {
    if (monthDiff < 0 || (monthDiff === 0 && endDate.getDate() < birthDate.getDate())) {
      age--;
    }
  }

  return { age, isIncomplete };
};

/**
 * Immich 人物页地址（face_uuid → 外链）。
 *
 * Immich 已收归 home.lan（容器端口仅 127.0.0.1 监听），统一固定走 https://photo.home.lan，
 * 不再直连 IP:2283。头像右键菜单与详细档案的「在 Immich 查看」共用同一份拼接逻辑。
 */
export const IMMICH_BASE_URL = 'https://photo.home.lan';
export const immichPersonUrl = (faceUuid) => `${IMMICH_BASE_URL}/people/${faceUuid}`;