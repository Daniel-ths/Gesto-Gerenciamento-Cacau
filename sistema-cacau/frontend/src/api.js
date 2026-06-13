export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const defaultHeaders = {
  'Content-Type': 'application/json',
};

const buildUrl = (url) => {
  if (!url) return API_BASE_URL;
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

export const api = {
  get: (url) =>
    fetch(buildUrl(url), {
      method: 'GET',
      headers: defaultHeaders,
    }),

  post: (url, body) =>
    fetch(buildUrl(url), {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(body || {}),
    }),

  put: (url, body) =>
    fetch(buildUrl(url), {
      method: 'PUT',
      headers: defaultHeaders,
      body: JSON.stringify(body || {}),
    }),

  delete: (url) =>
    fetch(buildUrl(url), {
      method: 'DELETE',
      headers: defaultHeaders,
    }),
};
