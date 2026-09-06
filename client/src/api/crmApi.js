import axios from 'axios';

// 根据构建环境自动切换 baseURL，无需手动注释代码
// 开发环境 (npm start)：前端与后端分别运行在不同端口，需通过完整 URL 跨端口请求
// 生产环境 (npm run build)：前端静态资源由后端托管，使用相对路径即可
const isDev = process.env.NODE_ENV === 'development';
const devBaseURL = `http://${window.location.hostname}:${process.env.REACT_APP_BACKEND_PORT}/api`;

const api = axios.create({
  baseURL: isDev ? devBaseURL : '/api',
});

// 身份认证由反向代理层（Authelia SSO）统一完成，无需 Token 注入与 401 处理

export const contactApi = {
  getAll: () => api.get('/contacts'),
  save: (data) => api.post('/contacts', data),
  delete: (id) => api.delete(`/contacts/${id}`),
  updateOrder: (contactIds) => api.put('/contacts/order', { contactIds }),
  getAvatar: (Uuid) => api.get(`/proxy-face/${Uuid}`, { responseType: 'blob' })
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