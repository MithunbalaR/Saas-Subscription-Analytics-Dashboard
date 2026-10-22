import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { translations } from "./translations.js";
import { useAuth } from "../context/AuthContext.jsx";

const I18nContext = createContext(null);
const STORAGE_KEY = "language";

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || "en";
  } catch {
    return "en";
  }
};

// t("dashboard.greeting", { name: "Mithun" }) -> "Hi, Mithun" / "नमस्ते, Mithun" / "வணக்கம், Mithun"
export function I18nProvider({ children }) {
  const { user, updateProfile } = useAuth();
  const [language, setLanguageState] = useState(readStored);

  // A logged-in user's saved language wins over the browser's stored one.
  useEffect(() => {
    if (user?.language) setLanguageState(user.language);
  }, [user?.language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = async (code) => {
    setLanguageState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    if (user) await updateProfile({ language: code }).catch(() => {});
  };

  const t = useCallback(
    (key, vars = {}) => {
      const text = translations[language]?.[key] ?? translations.en[key] ?? key;
      return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
    },
    [language]
  );

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => useContext(I18nContext);
