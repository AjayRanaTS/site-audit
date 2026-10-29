"use client";

import { Moon, Sun } from "lucide-react";

export default function ThemeSwitch({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  const nextTheme = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      onClick={onToggle}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-amber-300 transition hover:bg-white/[0.08]"
    >
      {theme === "light" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
