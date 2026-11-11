import type { Router } from "expo-router";

// router.back() fails when a screen was opened directly (deep link / refresh); fall back to a known route.
export function goBack(router: Router, fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}
