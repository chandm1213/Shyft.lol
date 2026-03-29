"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

/**
 * Syncs the Zustand theme state to the `data-theme` attribute on <html>.
 * Also updates the meta theme-color for mobile browsers.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);

    // Update meta theme-color for browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? "#0F1117" : "#FFFFFF");
    }
  }, [theme]);

  return <>{children}</>;
}
