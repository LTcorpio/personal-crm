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

    // 3. 标签路径匹配
    const matchesTag = !selectedTagPath || (
      c.tag && c.tag.some(t => t === selectedTagPath || t.startsWith(selectedTagPath + '/'))
    );

    return matchesSearch && matchesTag;
  });
};