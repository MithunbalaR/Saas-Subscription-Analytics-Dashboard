import { createContext, useContext, useEffect, useState } from "react";
import { CHART_COLORS } from "../utils/constants.js";

const ThemeContext = createContext(null);
const STORAGE_KEY = "theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

const readStoredTheme = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || "system";
  } catch {
    return "system";
  }
};

// theme: "light" | "dark" | "system" (follow the operating system setting)
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [systemDark, setSystemDark] = useState(media.matches);

  useEffect(() => {
    const onChange = (e) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setTheme = (value) => {
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable (private mode) - theme still applies for this visit */
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme, isDark }}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);

// eslint-disable-next-line react-refresh/only-export-components
export const useChartColors = () => CHART_COLORS[useTheme().isDark ? "dark" : "light"];
