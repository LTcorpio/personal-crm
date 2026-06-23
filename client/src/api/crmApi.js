import axios from 'axios';

const currentHostname = window.location.hostname;
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT;
const baseURL = `http://${currentHostname}:${BACKEND_PORT}/api`;

const api = axios.create({
  baseURL: baseURL,
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