import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const API_URL = `${BACKEND_URL}/api`;

const TOKEN_KEY = "session_token_v1";
let inMemoryToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  try {
    if (Platform.OS === "web") {
      const t = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
      inMemoryToken = t;
      return t;
    }
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    inMemoryToken = t;
    return t;
  } catch {
    return null;
  }
}

export async function setToken(token: string | null) {
  inMemoryToken = token;
  try {
    if (Platform.OS === "web") {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {}
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as any) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    await setToken(null);
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function fileUrl(attachmentId: string, token: string | null): string {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_URL}/attachments/${attachmentId}/file${q}`;
}
