import axios from 'axios';

// 根据构建环境自动切换 baseURL，无需手动注释代码
// 开发环境 (npm start)：前端与后端分别运行在不同端口，需通过完整 URL 跨端口请求
// 生产环境 (npm run build)：前端静态资源由后端托管，使用相对路径即可
const isDev = process.env.NODE_ENV === 'development';
const devBaseURL = `http://${window.location.hostname}:${process.env.REACT_APP_BACKEND_PORT}/api`;

const api = axios.create({
  baseURL: isDev ? devBaseURL : '/api',
});

// ==========================================
// 1. 请求拦截器：自动注入 JWT Token
// ==========================================
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('crm_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ==========================================
// 2. 响应拦截器：捕获鉴权失败 (401/403)
// ==========================================
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 如果是登录接口本身失败(401)，严禁执行页面刷新，否则提示信息会被刷新冲掉
    const isLoginUrl = error.config?.url?.endsWith('/auth/login');

    if (!isLoginUrl && error.response && (error.response.status === 401 || error.response.status === 403)) {
      localStorage.removeItem('crm_token');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// 登录鉴权 API
export const authApi = {
  login: (password) => api.post('/auth/login', { password }),
  changePassword: (oldPassword, newPassword) => api.post('/settings/update', { oldPassword, newPassword }),
  logout: () => api.post('/auth/logout'),
};

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
  // 批量调整名单显示顺序
  updateOrder: (rosterIds) => api.put('/rosters/order', { rosterIds }),
  // 搜索 / 筛选（跨名单聚合或指定名单）
  search: (params) => api.get('/rosters/search', { params }),
  // 获取指定名单中某列的不重复值（用于筛选下拉选项）
  getColumnValues: (id, column) => api.get(`/rosters/${id}/column-values`, { params: { column } }),
};