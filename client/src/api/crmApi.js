// src/api/crmApi.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:15197/api', // 统一维护的 API 根路径
});

export const contactApi = {
  getAll: () => api.get('/contacts'),
  save: (data) => api.post('/contacts', data),
  delete: (id) => api.delete(`/contacts/${id}`),
};

export const tagApi = {
  getTree: () => api.get('/tags/tree'),
  updateOrder: (tagIds) => api.put('/tags/order', { tagIds }),
  delete: (id) => api.delete(`/tags/${id}`),
};

export const topicApi = {
  getAll: () => api.get('/topics'),
  updateOrder: (topicIds) => api.put('/topics/order', { topicIds }),
  create: (data) => api.post('/topics', data),
  update: (id, data) => api.put(`/topics/${id}`, data),
  delete: (id) => api.delete(`/topics/${id}`),
};