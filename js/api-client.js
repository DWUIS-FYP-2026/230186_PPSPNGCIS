/**
 * PMS REST API client — talks to the Node.js backend (MySQL / WampServer).
 */
const PMSApi = (() => {
  const TOKEN_KEY = 'pms_api_token';

  function getBaseUrl() {
    if (typeof window !== 'undefined' && window.PMS_API_BASE) return window.PMS_API_BASE.replace(/\/$/, '');
    try {
      const stored = localStorage.getItem('pms_api_base');
      if (stored) return stored.replace(/\/$/, '');
    } catch (_) { /* ignore */ }
    return 'http://localhost:3000';
  }

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
  }

  function setToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) { /* ignore */ }
  }

  function getAuthHeaders(extra = {}) {
    const headers = { Accept: 'application/json', ...extra };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function request(method, path, body, { auth = true } = {}) {
    const url = `${getBaseUrl()}${path}`;
    const headers = auth
      ? getAuthHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      : { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error(`Cannot reach PMS API at ${getBaseUrl()}. Start the server (npm start in /server) and ensure WampServer MySQL is running.`);
    }

    let payload = {};
    try {
      payload = await res.json();
    } catch (_) {
      payload = { error: res.statusText || 'Unexpected server response' };
    }

    if (!res.ok || payload.success === false) {
      const err = new Error(payload.error || payload.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return payload;
  }

  async function checkHealth() {
    return request('GET', '/api/health', undefined, { auth: false });
  }

  async function login(identifier, password) {
    const payload = await request('POST', '/api/auth/login', { identifier, password }, { auth: false });
    setToken(payload.token);
    return { token: payload.token, user: payload.user };
  }

  async function logout() {
    try {
      await request('POST', '/api/auth/logout');
    } catch (_) { /* ignore */ }
    setToken(null);
  }

  async function me() {
    const payload = await request('GET', '/api/auth/me');
    return payload.user;
  }

  async function loadBootstrap() {
    const payload = await request('GET', '/api/bootstrap');
    return payload.data;
  }

  async function syncBootstrap(data, demoPasswords = {}) {
    return request('PUT', '/api/bootstrap', { data, demoPasswords });
  }

  async function seedDatabase(force = true) {
    return request('POST', '/api/bootstrap/seed', { force });
  }

  async function getInstitutions() {
    const payload = await request('GET', '/api/institutions');
    return payload.data;
  }

  async function createPrisoner(record) {
    const payload = await request('POST', '/api/prisoners', record);
    return payload.data;
  }

  async function updatePrisoner(prisonerNumber, record) {
    const payload = await request('PUT', `/api/prisoners/${encodeURIComponent(prisonerNumber)}`, record);
    return payload.data;
  }

  async function getPrisoner(prisonerNumber) {
    const payload = await request('GET', `/api/prisoners/${encodeURIComponent(prisonerNumber)}`);
    return payload.data;
  }

  async function listPrisonerDocuments(prisonerId) {
    const payload = await request('GET', `/api/prisoners/${encodeURIComponent(prisonerId)}/documents`);
    return payload.data;
  }

  async function uploadPrisonerDocument(prisonerId, doc) {
    const payload = await request('POST', `/api/prisoners/${encodeURIComponent(prisonerId)}/documents`, doc);
    return payload.data;
  }

  async function deletePrisonerDocument(prisonerId, docId) {
    return request('DELETE', `/api/prisoners/${encodeURIComponent(prisonerId)}/documents/${encodeURIComponent(docId)}`);
  }

  async function saveForm1(appId, form1, { submit = false, supervisorReview = false } = {}) {
    return request('POST', `/api/applications/${encodeURIComponent(appId)}/form1`, {
      form1,
      submit,
      supervisorReview,
    });
  }

  return {
    getBaseUrl,
    getToken,
    setToken,
    getAuthHeaders,
    checkHealth,
    login,
    logout,
    me,
    loadBootstrap,
    syncBootstrap,
    seedDatabase,
    saveForm1,
    getInstitutions,
    createPrisoner,
    updatePrisoner,
    getPrisoner,
    listPrisonerDocuments,
    uploadPrisonerDocument,
    deletePrisonerDocument,
  };
})();
