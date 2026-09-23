import { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * 量测「文字真实排版宽度」。
 *
 * 用 Range 而不是 `el.scrollWidth`：Range 的矩形由文字排版结果决定，
 * 不受 overflow / text-overflow: ellipsis 的裁剪影响，也不会因为
 * 「真正把文字裁掉的是祖先容器」而失真。
 */
const measureTextWidth = (el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  if (typeof range.detach === 'function') range.detach();
  return rect.width;
};

/**
 * 文字实际可见的宽度上限。
 *
 * 只看元素自身的 clientWidth 会漏判：如果元素比可视区还宽（例如整行被外侧
 * 滚动容器/抽屉裁掉一截、或者右侧还有别的内容把文字挤掉），clientWidth 会比
 * 真正能看见的宽度大，比较结果就会误判成「没被截断」。
 * 所以再向上找第一个会裁剪水平溢出的祖先，取两者的较小值。
 */
const getVisibleTextWidth = (el) => {
  // 用 getBoundingClientRect().width（分数）而不是 clientWidth（取整），避免亚像素误判
  const rect = el.getBoundingClientRect();
  let width = rect.width;
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    if (window.getComputedStyle(p).overflowX === 'visible') continue;
    const pr = p.getBoundingClientRect();
    // 裁剪边界 = 祖先的内边距盒右缘（clientLeft = 左边框宽，clientWidth 含 padding、不含滚动条）
    width = Math.min(width, pr.left + p.clientLeft + p.clientWidth - rect.left);
    break;
  }
  return width;
};

/** 文字是否没能完整显示（自身省略号截断 或 被祖先容器裁掉） */
const isTextClipped = (el) => {
  const textWidth = measureTextWidth(el);
  if (textWidth <= 0) return false;
  if (textWidth > getVisibleTextWidth(el) + 0.5) return true;
  // 兜底：也接受浏览器自己的截断判定，两者任一命中都算
  return el.scrollWidth > el.clientWidth + 0.5;
};

/**
 * 标签树节点标题：「标签名（过长省略号截断） + 人数（固定靠右）」。
 *
 * 悬停时，如果标签名确实被截断，就在原来那一行的位置上弹出一个浮窗，
 * 完整显示标签名和人数，浮窗**直接盖住原标签行**。
 *
 * 两个关键实现点：
 *  1. 浮窗用 `createPortal` 挂到 body 上，并用 `position: fixed` 定位。
 *     标签树本身在 `overflow-y-auto` 的滚动容器里，行内绝对定位的浮窗会被裁剪，
 *     且会撑大容器的可滚动区域（侧栏就冒出滚动条了）；挂到 body 之后
 *     浮窗可以自由突破侧栏容器，也不再影响侧栏的滚动尺寸。
 *  2. 锚点取「整行」（节点内容容器）的矩形：浮窗左边缘与行左边缘对齐、
 *     垂直居中于该行，所以名字比一行宽时会自然向右溢出（盖住右侧内容），
 *     而不是在侧栏内部被截断或换行。
 */
export const TagTreeTitle = ({ name, count }) => {
  const nameRef = useRef(null);
  // 浮窗锚点：{ left, top }，其中 top 为行中线的视口 y 坐标
  const [anchor, setAnchor] = useState(null);
  // 同一次「进入行 → 判定」周期内只量测一次，避免 mousemove 里反复做布局读取
  const measuredRef = useRef(false);

  const evaluate = () => {
    measuredRef.current = true;
    const el = nameRef.current;
    if (!el) return;
    // 只在文字没能完整显示时才弹：悬停那一刻实时量测，
    // 这样侧边栏拖动改宽后也不需要额外的 resize 监听
    if (!isTextClipped(el)) return;
    const rowEl = el.closest('.ant-tree-node-content-wrapper') || el;
    const rect = rowEl.getBoundingClientRect();
    setAnchor({ left: rect.left, top: rect.top + rect.height / 2 });
  };

  const handleMouseEnter = () => {
    measuredRef.current = false;
    evaluate();
  };

  // 兜底：mouseenter 有可能被吞掉（例如「行是在指针已经停在该位置之后才渲染出来的」，
  // 浏览器不会为新出现在指针下的元素补发 mouseenter）。指针在行内移动时补判一次。
  const handleMouseMove = () => {
    if (!measuredRef.current) evaluate();
  };

  return (
    <>
      <span
        className="flex w-full min-w-0 items-center gap-2"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setAnchor(null)}
        // 浮窗是 fixed 定位、不会跟着树滚动，滚轮一滚就收起，避免浮窗与行错位
        onWheel={() => setAnchor(null)}
      >
        <span ref={nameRef} className="min-w-0 flex-1 truncate font-bold text-black-700">
          {name}
        </span>
        <Tag className="!m-0 shrink-0 font-normal text-gray-400 text-xs">{count}</Tag>
      </span>

      {anchor &&
        createPortal(
          // 定位/层级/命中这几项关键样式直接写成内联样式，不走 Tailwind 工具类：
          // 浮窗是「挂在 body 上的脱离文档流的浮层」，一旦某个工具类没被生成，
          // 它就会退化成一个静态块跑到页面末尾（看起来就是「悬停没反应」）。
          //   position: fixed + left/top + translateY(-50%) —— 左缘与行对齐、垂直居中于该行，
          //     且不受祖先 transform / overflow 裁剪影响，能突破侧栏容器；
          //   pointerEvents: none —— 只是展示，不能挡住点击选中 / 展开箭头；
          //   maxWidth + overflowWrap —— 常规一行到底，极端超长名字才在浮窗内换行；
          //   zIndex 1050 —— 在 antd Drawer/Modal(1000) 之上、Tooltip(1070) 之下。
          <span
            className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-0.5 shadow-md"
            style={{
              position: 'fixed',
              left: anchor.left,
              top: anchor.top,
              transform: 'translateY(-50%)',
              zIndex: 1050,
              pointerEvents: 'none',
              maxWidth: 'min(70vw, 600px)',
              overflowWrap: 'break-word'
            }}
          >
            <span className="min-w-0 font-bold text-black-700">{name}</span>
            <Tag className="!m-0 shrink-0 font-normal text-gray-400 text-xs">{count}</Tag>
          </span>,
          document.body
        )}
    </>
  );
};

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
      // 被截断时的完整内容由 TagTreeTitle 的悬停浮窗承载（不再用原生 title 属性）。
      title: <TagTreeTitle name={node.name} count={matchCount} />,
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