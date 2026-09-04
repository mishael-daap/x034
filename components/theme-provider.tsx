"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme provider: dark mode by default (no toggle, no system switching).
 * Applies the `.dark` class to <html> so the globals.css dark palette is used.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
