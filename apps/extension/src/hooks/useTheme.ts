import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

function readDevToolsThemeName(): string | undefined {
  try {
    const themeName = (
      globalThis as {
        chrome?: { devtools?: { panels?: { themeName?: string } } };
      }
    ).chrome?.devtools?.panels?.themeName;
    return typeof themeName === "string" ? themeName : undefined;
  } catch {
    return undefined;
  }
}

function themeFromDevToolsName(themeName: string): Theme {
  return themeName === "dark" ? "dark" : "light";
}

function themeFromMatchMedia(): Theme {
  if (typeof window === "undefined" || window.matchMedia === undefined) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(): Theme {
  const themeName = readDevToolsThemeName();
  if (themeName !== undefined) {
    return themeFromDevToolsName(themeName);
  }
  return themeFromMatchMedia();
}

export function useTheme(): { readonly theme: Theme } {
  const [theme, setTheme] = useState<Theme>(resolveTheme);

  useEffect(() => {
    setTheme(resolveTheme());

    if (typeof window === "undefined" || window.matchMedia === undefined) {
      return;
    }

    // themeName is typically static for the panel lifetime; still listen to OS
    // preference for the fallback path and re-check on visibility.
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (): void => {
      setTheme(resolveTheme());
    };

    mediaQuery.addEventListener("change", handleChange);
    document.addEventListener("visibilitychange", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      document.removeEventListener("visibilitychange", handleChange);
    };
  }, []);

  return { theme };
}
