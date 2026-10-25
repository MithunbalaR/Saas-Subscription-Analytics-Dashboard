import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "/api";
const api = axios.create({ baseURL, withCredentials: true });

// The access token lives only in memory (not localStorage) so injected scripts can't steal it.
// After a page reload it is recovered from the httpOnly refresh cookie via /auth/refresh.
let accessToken = null;
let workspaceId = null;
let onSessionExpired = () => {};

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  accessToken = token;
};
export const getWorkspaceId = () => workspaceId;
export const setWorkspaceId = (id) => {
  workspaceId = id;
};
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (workspaceId) config.headers["X-Workspace-Id"] = workspaceId;
  return config;
});

// Several requests can fail with 401 at once; they all wait for the same refresh call.
let refreshing = null;
export const refreshSession = () => {
  refreshing ??= axios
    .post(`${baseURL}/auth/refresh`, null, { withCredentials: true })
    .then(({ data }) => {
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

const NO_RETRY = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/2fa/verify", "/auth/config"];

// When the access token expires: refresh it once and replay the original request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config._retried && !NO_RETRY.some((p) => config.url?.startsWith(p))) {
      config._retried = true;
      try {
        await refreshSession();
        return api(config);
      } catch {
        accessToken = null;
        onSessionExpired();
      }
    }
    return Promise.reject(error);
  }
);

export const getErrorMessage = (err) => err.response?.data?.message || err.message || "Something went wrong";

// Opens a file that needs the auth header (e.g. a receipt) in a new tab.
export const openProtectedFile = async (url) => {
  const tab = window.open("", "_blank"); // opened synchronously so popup blockers allow it
  try {
    const { data } = await api.get(url, { responseType: "blob" });
    const objectUrl = URL.createObjectURL(data);
    if (tab) tab.location.href = objectUrl;
    else window.location.href = objectUrl;
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    tab?.close();
    throw err;
  }
};

export const API_BASE = baseURL;

export default api;
