import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { apiFetch, setToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

export type AuthUser = {
  user_id: string;
  name: string;
  email: string;
  profile_image?: string | null;
  created_at?: string;
};

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(Ctx);
}

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const processedRef = useRef<Set<string>>(new Set());
  const capturedUrlRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await apiFetch<AuthUser>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  const exchangeSession = useCallback(async (sessionId: string) => {
    if (processedRef.current.has(sessionId)) return;
    processedRef.current.add(sessionId);
    try {
      const data = await apiFetch<{ session_token: string; user: AuthUser }>("/auth/session", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      await setToken(data.session_token);
      setUser(data.user);
    } catch (e) {
      console.warn("session exchange failed", e);
    }
  }, []);

  // Web: parse URL on mount
  useEffect(() => {
    (async () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const url = window.location.href;
        const sid = extractSessionId(url);
        if (sid) {
          await exchangeSession(sid);
          try {
            const u = new URL(window.location.href);
            u.hash = u.hash.replace(/([#&])session_id=[^&]+/g, "$1").replace(/[#&]$/, "");
            u.searchParams.delete("session_id");
            window.history.replaceState(window.history.state, "", u.toString());
          } catch {}
        }
      } else {
        const initial = await Linking.getInitialURL();
        const sid = extractSessionId(initial);
        if (sid) await exchangeSession(sid);
      }
      await refresh();
      setLoading(false);
    })();
  }, [exchangeSession, refresh]);

  // Native: listen for hot deep links
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", (ev) => {
      capturedUrlRef.current = ev.url;
      const sid = extractSessionId(ev.url);
      if (sid) exchangeSession(sid).then(() => refresh());
    });
    return () => sub.remove();
  }, [exchangeSession, refresh]);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const redirectUrl = window.location.origin + "/";
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      window.location.href = authUrl;
      return;
    }
    const redirectUrl = Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    capturedUrlRef.current = null;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let returned: string | null = (result as any).url ?? null;
    if (!returned) returned = capturedUrlRef.current;
    if (!returned) returned = await Linking.getInitialURL();
    const sid = extractSessionId(returned);
    if (sid) {
      await exchangeSession(sid);
      await refresh();
    }
  }, [exchangeSession, refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signInWithGoogle, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
