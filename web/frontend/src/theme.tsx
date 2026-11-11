import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ColorScheme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

// Same tokens as the mobile app (frontend/src/theme.ts / design_guidelines.json).
const light = {
  surface: "#F9FAFA",
  onSurface: "#1A1C1B",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1C1B",
  surfaceTertiary: "#F1F3F2",
  onSurfaceTertiary: "#4A5568",
  surfaceInverse: "#1A1C1B",
  onSurfaceInverse: "#F9FAFA",
  muted: "#64748B",

  brand: "#2E523A",
  onBrand: "#FFFFFF",
  brandPrimary: "#2E523A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E27357",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E7F0EB",
  onBrandTertiary: "#2E523A",

  success: "#3A7553",
  onSuccess: "#FFFFFF",
  warning: "#E2A03F",
  onWarning: "#FFFFFF",
  error: "#D64F4F",
  onError: "#FFFFFF",
  info: "#4A5568",
  onInfo: "#FFFFFF",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
};

const dark: typeof light = {
  surface: "#121413",
  onSurface: "#F9FAFA",
  surfaceSecondary: "#1C1F1D",
  onSurfaceSecondary: "#F9FAFA",
  surfaceTertiary: "#262B28",
  onSurfaceTertiary: "#9CA3AF",
  surfaceInverse: "#F9FAFA",
  onSurfaceInverse: "#1A1C1B",
  muted: "#9CA3AF",

  brand: "#4EA77A",
  onBrand: "#121413",
  brandPrimary: "#4EA77A",
  onBrandPrimary: "#121413",
  brandSecondary: "#E68A72",
  onBrandSecondary: "#121413",
  brandTertiary: "#1E3628",
  onBrandTertiary: "#4EA77A",

  success: "#5CB383",
  onSuccess: "#121413",
  warning: "#EAB566",
  onWarning: "#121413",
  error: "#E57373",
  onError: "#121413",
  info: "#9CA3AF",
  onInfo: "#121413",

  border: "#2D3748",
  borderStrong: "#4A5568",
  divider: "#262B28",
};

export type ThemeColors = typeof light;
export const themes: Record<ColorScheme, ThemeColors> = { light, dark };

const PREF_KEY = "theme_preference_v1";

type ThemeCtx = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  scheme: ColorScheme;
  colors: ThemeColors;
};

const Ctx = createContext<ThemeCtx>({
  preference: "system",
  setPreference: () => {},
  scheme: "light",
  colors: light,
});

function readPref(): ThemePreference {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked */
  }
  return "system";
}

function toCssVar(key: string): string {
  return `--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readPref);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const scheme: ColorScheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  const colors = themes[scheme];

  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(colors)) root.style.setProperty(toCssVar(k), v);
    root.style.colorScheme = scheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors.surfaceSecondary);
  }, [colors, scheme]);

  const value = useMemo<ThemeCtx>(
    () => ({
      preference,
      scheme,
      colors,
      setPreference: (p) => {
        setPref(p);
        try {
          localStorage.setItem(PREF_KEY, p);
        } catch {
          /* storage blocked */
        }
      },
    }),
    [preference, scheme, colors],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

type StatusKind = "application" | "interview" | "result" | "difficulty";

const STATUS_MAP: Record<StatusKind, Record<string, keyof ThemeColors>> = {
  application: {
    Interested: "info",
    Applied: "info",
    "Recruiter Screening": "brandSecondary",
    "Interview Scheduled": "brandTertiary",
    "Interview In Progress": "brandPrimary",
    "Offer Received": "success",
    "Offer Accepted": "success",
    Rejected: "error",
    "On Hold": "warning",
    Withdrawn: "muted",
  },
  interview: { Scheduled: "brandTertiary", Completed: "success", Rescheduled: "warning", Cancelled: "error" },
  result: { Passed: "success", Failed: "error", Pending: "warning" },
  difficulty: { Easy: "success", Medium: "warning", Hard: "error" },
};

export function statusColor(colors: ThemeColors, status: string, kind: StatusKind): { bg: string; fg: string } {
  const token = STATUS_MAP[kind][(status || "").trim()] ?? "surfaceTertiary";
  const fgKey: keyof ThemeColors =
    token === "brandTertiary"
      ? "onBrandTertiary"
      : token === "surfaceTertiary" || token === "muted"
        ? "onSurfaceTertiary"
        : (`on${token.charAt(0).toUpperCase()}${token.slice(1)}` as keyof ThemeColors);
  return { bg: colors[token], fg: colors[fgKey] ?? colors.onSurface };
}
