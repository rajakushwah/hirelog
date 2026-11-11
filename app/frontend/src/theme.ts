import { useMemo, useEffect, useState, createContext, useContext } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

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
export const defaultScheme: ColorScheme = "light";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fontSize = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

const PREF_KEY = "theme_preference_v1";

type PrefCtxValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};
const PrefContext = createContext<PrefCtxValue>({
  preference: "system",
  setPreference: () => {},
});

export function useThemePreference() {
  return useContext(PrefContext);
}

export function useThemeState(): PrefCtxValue & { scheme: ColorScheme; colors: ThemeColors } {
  const [preference, setPref] = useState<ThemePreference>("system");
  const system = useColorScheme();
  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setPref(v);
    });
  }, []);
  const setPreference = (p: ThemePreference) => {
    setPref(p);
    AsyncStorage.setItem(PREF_KEY, p).catch(() => {});
    if (p === "system") Appearance.setColorScheme?.("unspecified" as any);
    else Appearance.setColorScheme?.(p);
  };
  const effective: ColorScheme =
    preference === "light" || preference === "dark"
      ? preference
      : system === "dark"
        ? "dark"
        : "light";
  return { preference, setPreference, scheme: effective, colors: themes[effective] };
}

export { PrefContext };

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const { preference } = useThemePreference();
  const system = useColorScheme();
  const effective: ColorScheme =
    preference === "light" || preference === "dark"
      ? preference
      : system === "dark"
        ? "dark"
        : "light";
  return { scheme: effective, colors: themes[effective] };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Status color mapping
export function statusColor(colors: ThemeColors, status: string, kind: "application" | "interview" | "result" | "difficulty"): { bg: string; fg: string } {
  const key = (status || "").trim();
  const map: Record<string, Record<string, keyof ThemeColors>> = {
    application: {
      "Interested": "info",
      "Applied": "info",
      "Recruiter Screening": "brandSecondary",
      "Interview Scheduled": "brandTertiary",
      "Interview In Progress": "brandPrimary",
      "Offer Received": "success",
      "Offer Accepted": "success",
      "Rejected": "error",
      "On Hold": "warning",
      "Withdrawn": "muted",
    },
    interview: {
      "Scheduled": "brandTertiary",
      "Completed": "success",
      "Rescheduled": "warning",
      "Cancelled": "error",
    },
    result: {
      "Passed": "success",
      "Failed": "error",
      "Pending": "warning",
    },
    difficulty: {
      "Easy": "success",
      "Medium": "warning",
      "Hard": "error",
    },
  };
  const token = map[kind]?.[key] ?? "surfaceTertiary";
  const bg = colors[token] as string;
  // brandTertiary and surfaceTertiary are light; use onBrandTertiary/onSurfaceTertiary
  const fgKey =
    token === "brandTertiary"
      ? "onBrandTertiary"
      : token === "surfaceTertiary" || token === "muted"
        ? "onSurfaceTertiary"
        : `on${token.charAt(0).toUpperCase()}${token.slice(1)}` as keyof ThemeColors;
  const fg = (colors[fgKey as keyof ThemeColors] as string) ?? colors.onSurface;
  return { bg, fg };
}
