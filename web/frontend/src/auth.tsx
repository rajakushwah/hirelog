import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, AUTH_EXPIRED_EVENT } from "./api";
import type { User } from "./types";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: (everywhere?: boolean) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const signedOut = useCallback(() => {
    setUser(null);
    // Nothing from the previous account may remain in memory.
    qc.clear();
  }, [qc]);

  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    window.addEventListener(AUTH_EXPIRED_EVENT, signedOut);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, signedOut);
  }, [signedOut]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        qc.clear();
        setUser(await api<User>("/auth/login", { json: { email, password } }));
      },
      register: async (name, email, password) => {
        qc.clear();
        setUser(await api<User>("/auth/register", { json: { name, email, password } }));
      },
      logout: async (everywhere = false) => {
        try {
          await api(everywhere ? "/auth/logout-all" : "/auth/logout", { method: "POST" });
        } finally {
          signedOut();
        }
      },
      deleteAccount: async () => {
        await api("/auth/me", { method: "DELETE", json: { confirm: "DELETE" } });
        signedOut();
      },
    }),
    [user, loading, qc, signedOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
