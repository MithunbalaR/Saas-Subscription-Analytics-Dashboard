import { createContext, useCallback, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import api, { refreshSession, setAccessToken, setSessionExpiredHandler } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const startSession = useCallback(({ accessToken, user }) => {
    setAccessToken(accessToken);
    setUser(user);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  // On page load, try to restore the session from the httpOnly refresh cookie.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
      toast.error("Your session expired. Please log in again.", { id: "session-expired" });
    });
    refreshSession()
      .then((data) => setUser(data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clearSession]);

  // Logging in may need a second step (2FA): then we return { twoFactorRequired, tempToken } to the page.
  const finishLogin = (data) => {
    if (data.twoFactorRequired) return data;
    startSession(data);
    return null;
  };
  const login = async (email, password) => finishLogin((await api.post("/auth/login", { email, password })).data);
  const loginWithGoogle = async (credential) => finishLogin((await api.post("/auth/google", { credential })).data);
  const verifyTwoFactor = async (tempToken, code) => {
    const { data } = await api.post("/auth/2fa/verify", { tempToken, code });
    startSession(data);
    return data;
  };
  const register = async (form) => startSession((await api.post("/auth/register", form)).data);

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    clearSession();
  };

  const updateProfile = async (updates) => {
    const { data } = await api.put("/auth/profile", updates);
    setUser(data.user);
  };

  const uploadAvatar = async (file) => {
    const form = new FormData();
    form.append("avatar", file);
    const { data } = await api.post("/auth/avatar", form);
    setUser(data.user);
  };

  const removeAvatar = async () => {
    const { data } = await api.delete("/auth/avatar");
    setUser(data.user);
  };

  const changePassword = async (currentPassword, newPassword) =>
    startSession((await api.put("/auth/password", { currentPassword, newPassword })).data);

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, loginWithGoogle, verifyTwoFactor, register, logout, updateProfile, uploadAvatar, removeAvatar, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
