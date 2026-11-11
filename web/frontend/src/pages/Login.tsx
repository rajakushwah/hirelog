import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, GoogleLogo } from "@phosphor-icons/react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, Field, InlineSpinner } from "../components/ui";
import type { AuthConfig } from "../types";
import { Logo } from "../components/Logo";

const OAUTH_ERRORS: Record<string, string> = {
  google_failed: "Google sign-in didn't complete. Please try again.",
  email_not_verified: "Your Google email isn't verified.",
  registration_disabled: "New sign-ups are turned off on this server.",
};

export function Login() {
  const { login, register } = useAuth();
  const [params] = useSearchParams();
  const { data: config } = useQuery({ queryKey: ["auth-config"], queryFn: () => api<AuthConfig>("/auth/config") });
  const [mode, setMode] = useState<"signin" | "signup">(() => (params.get("mode") === "signup" ? "signup" : "signin"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(() => {
    const code = params.get("error");
    return code ? OAUTH_ERRORS[code] ?? "Sign-in failed. Please try again." : null;
  });

  const signup = mode === "signup";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (signup) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="login">
      <div className="login-box">
        <Link className="link row" to="/" style={{ alignSelf: "flex-start", fontWeight: 600 }}>
          <ArrowLeft size={16} weight="bold" /> Back to home
        </Link>
        <div className="login-hero">
          <Logo size={88} className="logo-hero" />
          <h1>HireLog</h1>
          <p>Your job hunt, finally organised.</p>
        </div>

        <form className="card stack" onSubmit={onSubmit} style={{ padding: 24 }}>
          {config?.registration_enabled !== false ? (
            <div className="segment" role="tablist">
              <button type="button" role="tab" aria-selected={!signup} className={!signup ? "selected" : ""} onClick={() => setMode("signin")}>
                Sign in
              </button>
              <button type="button" role="tab" aria-selected={signup} className={signup ? "selected" : ""} onClick={() => setMode("signup")}>
                Create account
              </button>
            </div>
          ) : null}
          {signup ? <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={200} /> : null}
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={320} />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={signup ? 8 : undefined}
            maxLength={128}
          />
          {signup ? <span className="small">At least 8 characters. A long passphrase is best.</span> : null}
          <ErrorNote error={error} />
          <button className="btn btn-primary lg block" type="submit" disabled={pending}>
            {pending ? <InlineSpinner /> : signup ? "Create account" : "Sign in"}
          </button>

          {config?.google_enabled ? (
            <>
              <div className="or">or</div>
              <a className="btn btn-outline lg block" href="/api/auth/google/start">
                <GoogleLogo size={22} weight="bold" />
                Continue with Google
              </a>
            </>
          ) : null}
        </form>

        <p className="small" style={{ textAlign: "center", margin: 0 }}>
          Your job-search data is stored only on this server, in your private account.
        </p>
      </div>
    </div>
  );
}
