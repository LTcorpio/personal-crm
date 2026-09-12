import axios from 'axios';

// 根据构建环境自动切换 baseURL，无需手动注释代码
// 开发环境 (npm start)：前端与后端分别运行在不同端口，需通过完整 URL 跨端口请求
// 生产环境 (npm run build)：前端静态资源由后端托管，使用相对路径即可
const isDev = process.env.NODE_ENV === 'development';

// 后端主机前缀：供 <img src>、window.open 等走不了 axios 的场景拼接完整地址。
// 生产环境前端由后端托管（同源），相对路径即可，因此为空串。
export const apiOrigin = isDev
  ? `http://${window.location.hostname}:${process.env.REACT_APP_BACKEND_PORT}`
  : '';

const api = axios.create({
  baseURL: isDev ? `${apiOrigin}/api` : '/api',
});

// 后端返回的头像地址是相对路径（形如 /api/avatars/<hash>.jpg），这里补上主机前缀。
// 头像文件名即内容哈希，内容变了文件名就变，因此可以放心长期缓存。
export const avatarUrl = (path) => (path ? `${apiOrigin}${path}` : '');

// 原图下载地址：在静态资源地址后加 ?download=1，让后端以附件形式返回；
// 可附带 filename 指定下载名（后端会过滤引号、控制字符等危险字符）。
export const avatarDownloadUrl = (path, filename) => {
  if (!path) return '';
  const base = `${apiOrigin}${path}?download=1`;
  return filename ? `${base}&filename=${encodeURIComponent(filename)}` : base;
};

// 身份认证由反向代理层（Authelia SSO）统一完成，无需 Token 注入与 401 处理

export const contactApi = {
  getAll: () => api.get('/contacts'),
  save: (data) => api.post('/contacts', data),
  delete: (id) => api.delete(`/contacts/${id}`),
  updateOrder: (contactIds) => api.put('/contacts/order', { contactIds }),

  // ---- 头像：展示走本地文件，Immich 只在「抓取 / 同步」时被访问 ----
  // 历史头像列表（含当前头像哈希）
  getAvatars: (id) => api.get(`/contacts/${id}/avatars`),
  // 把历史中的某一张设为当前头像
  setAvatar: (id, hash) => api.put(`/contacts/${id}/avatar`, { hash }),
  // 删除一条历史头像（当前正在使用的不允许删除）
  deleteAvatar: (id, hash) => api.delete(`/contacts/${id}/avatars/${hash}`),
  // 从 Immich 按 face_uuid 抓取头像到本地并设为当前
  fetchAvatar: (id, faceUuid) =>
    api.post(`/contacts/${id}/avatar/fetch`, faceUuid ? { face_uuid: faceUuid } : {}),
  // 上传本地图片作为头像：
  //   file           裁剪后的正方形图（展示用）
  //   original       裁剪前的原图（可选，原样存档，供查看 / 下载 / 重新裁剪）
  //   originalIsFile 为真表示「未裁剪，方图就是原图」，无需重复上传同一份字节
  uploadAvatar: (id, file, original, originalIsFile) => {
    const formData = new FormData();
    formData.append('file', file);
    if (original) formData.append('original', original);
    if (originalIsFile) formData.append('original_is_file', '1');
    return api.post(`/contacts/${id}/avatar/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // 取回某张已存档原图的二进制，供「重新裁剪」在浏览器里重新取景
  getAvatarBlob: (fileName) => api.get(`/avatars/${fileName}`, { responseType: 'blob' }),
  // 批量回填：把所有「已绑定 face_uuid 但本地无图」的联系人补齐
  syncAvatars: () => api.post('/avatars/sync'),
  // 实时预览：仅用于新建联系人时预览刚填写的 UUID（不落库）
  previewImmichFace: (uuid) => api.get(`/proxy-face/${uuid}`, { responseType: 'blob' }),
};

export const tagApi = {
  getTree: () => api.get('/tags/tree'),
  updateOrder: (tagIds) => api.put('/tags/order', { tagIds }),
  delete: (id) => api.delete(`/tags/${id}`),
  update: (id, name) => api.put(`/tags/${id}`, { name }),
};

export const topicApi = {
  getAll: () => api.get('/topics'),
  updateOrder: (topicIds) => api.put('/topics/order', { topicIds }),
  create: (data) => api.post('/topics', data),
  update: (id, data) => api.put(`/topics/${id}`, data),
  delete: (id) => api.delete(`/topics/${id}`),
};

// 名单管理 API
export const rosterApi = {
  // 解析上传的 Excel 文件（返回预览数据，不落库）
  parse: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/rosters/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // 确认导入：保存到数据库
  save: (data) => api.post('/rosters', data),
  // 获取所有名单列表
  getAll: () => api.get('/rosters'),
  // 获取单份名单完整数据
  getById: (id) => api.get(`/rosters/${id}`),
  // 删除一份名单
  delete: (id) => api.delete(`/rosters/${id}`),
  // 重命名名单
  rename: (id, name) => api.put(`/rosters/${id}/name`, { name }),
  // 更新名单的可筛选字段
  updateFilterableColumns: (id, filterableColumns) => api.put(`/rosters/${id}/filterable-columns`, { filterableColumns }),
  // 批量调整名单显示顺序
  updateOrder: (rosterIds) => api.put('/rosters/order', { rosterIds }),
  // 搜索 / 筛选（跨名单聚合或指定名单）
  search: (params) => api.get('/rosters/search', { params }),
  // 获取指定名单中某列的不重复值（用于筛选下拉选项）
  getColumnValues: (id, column) => api.get(`/rosters/${id}/column-values`, { params: { column } }),
};