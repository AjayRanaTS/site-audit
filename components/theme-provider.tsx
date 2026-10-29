"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Theme } from "@/lib/theme";

const THEME_STORAGE_KEY = "speedaudit-theme";
const THEME_CHANGE_EVENT = "speedaudit-theme-change";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, getThemeSnapshot, () => "light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme: Theme = savedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initialTheme;
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return context;
}
