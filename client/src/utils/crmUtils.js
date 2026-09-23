import { Tag } from "antd";

// 联系方式内置类型：这些类型会在卡片模式展示，且展示名/图标固定；
// 类型名之外的任意键都被视为「自定义联系方式」，仅在详细档案弹窗中展示。
export const BUILTIN_CONTACT_TYPES = ['tel', 'email', 'wechat', 'qq', 'tiktok'];

/**
 * 从 contact 对象提取自定义联系方式（排除内置类型；空值忽略）。
 * @returns {Array<{type: string, value: string}>}
 */
export const extractCustomContactMethods = (contact = {}) =>
  Object.keys(contact || {})
    .filter((key) => !BUILTIN_CONTACT_TYPES.includes(key) && contact[key])
    .map((key) => ({ type: key, value: contact[key] }));

/**
 * 是否包含内置联系方式的有效值。卡片模式的「联系方式」块据此决定是否渲染，
 * 避免只有自定义联系方式时渲染出一个空盒子。
 */
export const hasBuiltinContactValue = (contact = {}) =>
  BUILTIN_CONTACT_TYPES.some((key) => contact?.[key]);

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
      // 标题为「标签名 + 人数」一行：标签名不换行、过长省略号截断，人数固定宽度靠右，
      // 这样各层标签的人数能在右侧排成一列（需要 Tree 传 blockNode，标题才有整行宽度可用）。
      // 完整标签名走浏览器原生 title 提示：名字被省略号截断时，悬停该行即可看到全称。
      // 不要再自绘浮层——浮层的宽度、层级、随侧栏变化的量测都容易出问题。
      title: (
        <span className="flex w-full min-w-0 items-center gap-2" title={node.name}>
          <span className="min-w-0 flex-1 truncate font-bold text-black-700">{node.name}</span>
          <Tag className="!m-0 shrink-0 font-normal text-gray-400 text-xs">{matchCount}</Tag>
        </span>
      ),
      matchCount,
      children
    };
  });
};

/**
 * 前端综合搜索与标签过滤算法
 *
 * 三个条件互相独立、取交集（搜索关键词 / 标签维度 / 头像维度）：
 * - 标签维度：`selectedTagPath` 为具体标签路径时按「自身或子孙标签」匹配；
 *   为哨兵值 '__NO_TAGS__' 或 options.noTag 为真时只保留没有任何标签的人。
 * - 头像维度：options.noAvatar 为真时只保留「没有本地头像缩略图」的人
 *   （判定口径＝ face_thumb_url 为空；只有 face_uuid、图还没抓下来的也算无头像，
 *    正是「待补全档案」的语义）。
 *
 * 注：标签维度里「无标签」与「选中某个标签」天然互斥（由调用方的状态互斥保证），
 * 这里以 noTag 优先。
 *
 * @param {Array} contacts 联系人列表
 * @param {string} searchTxt 搜索关键词
 * @param {string[]} searchFields 参与搜索的字段
 * @param {string|null} selectedTagPath 选中的标签路径（或 '__NO_TAGS__' 哨兵值）
 * @param {{noTag?:boolean, noAvatar?:boolean}} [options] 「无标签 / 无头像」两个筛选开关
 */
export const filterContacts = (contacts, searchTxt, searchFields, selectedTagPath, options = {}) => {
  const noTagActive = selectedTagPath === '__NO_TAGS__' || options.noTag === true;
  const noAvatarActive = options.noAvatar === true;
  const hasSearch = !!searchTxt && Array.isArray(searchFields) && searchFields.length > 0;

  return contacts.filter(c => {
    // 1. 标签维度
    let matchesTag = true;
    if (noTagActive) {
      matchesTag = !c.tag || c.tag.length === 0;
    } else if (selectedTagPath) {
      matchesTag = !!(c.tag && c.tag.some(t => t === selectedTagPath || t.startsWith(selectedTagPath + '/')));
    }
    if (!matchesTag) return false;

    // 2. 头像维度（可与标签维度叠加，取交集）
    if (noAvatarActive && c.face_thumb_url) return false;

    // 3. 没有搜索关键词时，到此即为匹配
    if (!hasSearch) return true;

    // 4. 动态匹配选中的字段
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

    return matchesSearch;
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