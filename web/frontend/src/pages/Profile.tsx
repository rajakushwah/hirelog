import { useState } from "react";
import { AndroidLogo, Bell, Devices, DownloadSimple, Moon, SignOut, Trash } from "@phosphor-icons/react";
import { useAuth } from "../auth";
import { apkHref, useAndroidInfo } from "../components/AndroidDownload";
import { ExportCard } from "../components/Exports";
import { ConfirmSheet, ErrorNote, Field } from "../components/ui";
import { remindersSupported, useReminderSetting } from "../reminders";
import { useTheme, type ThemePreference } from "../theme";
import { formatBytes, formatDate } from "../util";

const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function Profile() {
  const { user, logout, deleteAccount } = useAuth();
  const { preference, setPreference } = useTheme();
  const [reminders, setReminders] = useReminderSetting();
  const { data: android } = useAndroidInfo();
  const [sheet, setSheet] = useState<"logout" | "everywhere" | "delete" | null>(null);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!user) return null;
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  const close = () => {
    if (busy) return;
    setSheet(null);
    setTyped("");
    setError(null);
  };

  return (
    <div className="page narrow">
      <h1 className="page-title">Profile</h1>
      <div className="profile-hero card">
        <div className="avatar" aria-hidden>{initials}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="truncate" style={{ margin: 0 }}>{user.name}</h2>
          <p className="sub truncate" style={{ margin: 0 }}>{user.email}</p>
          <p className="small" style={{ margin: "4px 0 0" }}>Member since {formatDate(user.created_at)}</p>
        </div>
      </div>

      <div className="section-head"><h2>Appearance</h2></div>
      <div className="settings-group">
        <div className="settings-row">
          <span className="icon-box sm"><Moon size={20} weight="bold" /></span>
          <span className="grow"><strong>Theme</strong></span>
          <div className="segment" style={{ width: 240 }} role="radiogroup" aria-label="Theme">
            {APPEARANCE.map((a) => (
              <button key={a.value} role="radio" aria-checked={preference === a.value} className={preference === a.value ? "selected" : ""} onClick={() => setPreference(a.value)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="divider" />
        <label className="settings-row">
          <span className="icon-box sm"><Bell size={20} weight="bold" /></span>
          <span className="grow">
            <strong>Interview reminders</strong>
            <span className="small">
              {remindersSupported()
                ? "Browser notifications 24 hours and 1 hour before an interview, while this app is open in a tab."
                : "This browser doesn't support notifications."}
            </span>
            {reminderMsg ? <span className="small" role="alert" style={{ color: "var(--error)" }}>{reminderMsg}</span> : null}
          </span>
          <input type="checkbox" className="toggle" checked={reminders} disabled={!remindersSupported()} onChange={async (e) => setReminderMsg(await setReminders(e.target.checked))} />
        </label>
      </div>

      <div className="section-head"><h2>Export your data</h2></div>
      <ExportCard />

      {android?.available && apkHref(android.url) ? (
        <>
          <div className="section-head"><h2>Mobile app</h2></div>
          <div className="settings-group">
            <a
              className="settings-row"
              href={apkHref(android.url)}
              {...(android.url.startsWith("/") ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" })}
            >
              <span className="icon-box sm"><AndroidLogo size={20} weight="bold" /></span>
              <span className="grow">
                <strong>Get the Android app{android.version ? ` (v${android.version})` : ""}</strong>
                <span className="small">
                  Beta APK{android.size ? ` · ${formatBytes(android.size)}` : ""}. Not on the Play Store yet: allow &ldquo;Install unknown apps&rdquo; for your browser.
                </span>
                {!android.shared_account ? (
                  <span className="small" style={{ color: "var(--warning)" }}>
                    Separate beta account: data doesn&rsquo;t sync with the web app yet.
                  </span>
                ) : null}
                {android.sha256 ? <span className="small" style={{ wordBreak: "break-all" }}>SHA-256: {android.sha256}</span> : null}
              </span>
              <DownloadSimple size={20} />
            </a>
          </div>
        </>
      ) : null}

      <div className="section-head"><h2>Account</h2></div>
      <div className="settings-group">
        <button className="settings-row" onClick={() => setSheet("logout")}>
          <span className="icon-box sm"><SignOut size={20} weight="bold" /></span>
          <span className="grow"><strong>Sign out</strong></span>
        </button>
        <div className="divider" />
        <button className="settings-row" onClick={() => setSheet("everywhere")}>
          <span className="icon-box sm"><Devices size={20} weight="bold" /></span>
          <span className="grow">
            <strong>Sign out everywhere</strong>
            <span className="small">Ends every session on all devices.</span>
          </span>
        </button>
        <div className="divider" />
        <button className="settings-row" onClick={() => setSheet("delete")} style={{ color: "var(--error)" }}>
          <span className="icon-box sm" style={{ color: "var(--error)" }}><Trash size={20} weight="bold" /></span>
          <span className="grow">
            <strong>Delete account</strong>
            <span className="small">Permanently removes your account, applications, rounds, questions and files.</span>
          </span>
        </button>
      </div>
      <p className="small" style={{ textAlign: "center", marginTop: 24 }}>HireLog · your data is stored on your own server.</p>

      <ConfirmSheet
        open={sheet === "logout" || sheet === "everywhere"}
        title={sheet === "everywhere" ? "Sign out of all devices?" : "Sign out?"}
        confirmLabel="Sign out"
        busy={busy}
        onCancel={close}
        onConfirm={() => run(() => logout(sheet === "everywhere"))}
      >
        <ErrorNote error={error} />
      </ConfirmSheet>
      <ConfirmSheet
        open={sheet === "delete"}
        title="Delete your account?"
        message="This can't be undone. Export your data first if you want a copy."
        confirmLabel="Delete forever"
        busy={busy}
        confirmDisabled={typed !== "DELETE"}
        onCancel={close}
        onConfirm={() => run(deleteAccount)}
      >
        <Field label='Type "DELETE" to confirm' value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        <ErrorNote error={error} />
      </ConfirmSheet>
    </div>
  );
}
