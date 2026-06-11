/**
 * ClipAI Admin API Client
 * 基于 fetch 的轻量 API 封装
 */
const AdminAPI = (() => {
  const BASE = '/api/v1';

  function getToken() {
    return localStorage.getItem('clipai_admin_token');
  }

  function setToken(token) {
    localStorage.setItem('clipai_admin_token', token);
  }

  function clearToken() {
    localStorage.removeItem('clipai_admin_token');
  }

  function getUser() {
    const raw = localStorage.getItem('clipai_admin_user');
    return raw ? JSON.parse(raw) : null;
  }

  function setUser(user) {
    localStorage.setItem('clipai_admin_user', JSON.stringify(user));
  }

  function clearUser() {
    localStorage.removeItem('clipai_admin_user');
  }

  async function request(method, path, body) {
    const headers = {};

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json();

    if (res.status === 401) {
      clearToken();
      clearUser();
      window.location.hash = '#/login';
      throw new Error(json.message || '登录已过期');
    }

    if (!res.ok && json.code !== 0) {
      throw new Error(json.message || '请求失败');
    }

    return json;
  }

  return {
    getToken,
    setToken,
    clearToken,
    getUser,
    setUser,
    clearUser,

    // 通用请求
    request,

    // Auth
    async sendCode(phone) {
      return request('POST', '/auth/send-code', { phone });
    },

    async verifyCode(phone, code) {
      return request('POST', '/auth/verify', { phone, code });
    },

    // Admin Stats
    async getStats() {
      return request('GET', '/admin/stats');
    },

    // Admin Users
    async listUsers(params = {}) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, v); });
      return request('GET', '/admin/users?' + qs.toString());
    },

    async getUserDetail(userId) {
      return request('GET', `/admin/users/${userId}`);
    },

    async updateUserRole(userId, role) {
      return request('PATCH', `/admin/users/${userId}/role`, { role });
    },

    async updateUserCredits(userId, credits) {
      return request('PATCH', `/admin/users/${userId}/credits`, { credits });
    },

    async updateUserStatus(userId, status) {
      return request('PATCH', `/admin/users/${userId}/status`, { status });
    },

    // Admin Subscriptions
    async listSubscriptions(params = {}) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, v); });
      return request('GET', '/admin/subscriptions?' + qs.toString());
    },

    // Admin Tasks
    async listTasks(params = {}) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, v); });
      return request('GET', '/admin/tasks?' + qs.toString());
    },
  };
})();
