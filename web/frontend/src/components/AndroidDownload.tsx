import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AndroidLogo, AppleLogo, Check, Copy, DownloadSimple, Info, ShieldCheck, Warning } from "@phosphor-icons/react";
import { api } from "../api";
import type { AndroidInfo } from "../types";
import { formatBytes, safeHref } from "../util";

export function useAndroidInfo() {
  return useQuery({ queryKey: ["android-info"], queryFn: () => api<AndroidInfo>("/downloads/android"), staleTime: 5 * 60_000 });
}

/** Same-origin download path, or an external https URL. Anything else is refused. */
export function apkHref(url: string): string | undefined {
  return url.startsWith("/api/downloads/") ? url : safeHref(url)?.startsWith("https://") ? url : undefined;
}

function Checksum({ sha }: { sha: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  };
  return (
    <div className="lp-sha">
      <span className="lp-sha-label"><ShieldCheck size={14} weight="fill" /> SHA-256</span>
      <code>{sha}</code>
      <button type="button" onClick={copy} aria-label="Copy SHA-256 checksum">
        {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export function AndroidDownloadSection() {
  const { data } = useAndroidInfo();
  const href = data?.available ? apkHref(data.url) : undefined;
  const external = !!href && !href.startsWith("/");
  const meta = [data?.version && `v${data.version}`, data?.size ? formatBytes(data.size) : "", data?.min_android].filter(Boolean).join(" · ");

  return (
    <section id="downloads" className="lp-section">
      <div className="lp-wrap">
        <div className="lp-head center">
          <span className="lp-eyebrow"><DownloadSimple size={14} weight="bold" /> Downloads</span>
          <h2>Take HireLog with you</h2>
          <p>Log a round right after the call, snap the whiteboard, and get reminders before every interview.</p>
        </div>

        <div className="lp-dl-grid">
          <article className="lp-android">
            <div className="lp-dl-title">
              <span className="lp-dl-icon"><AndroidLogo size={28} weight="fill" /></span>
              <span>
                <h3>Android</h3>
                <span className="lp-android-meta">{data?.available ? `Beta${meta ? ` · ${meta}` : ""}` : "Beta"}</span>
              </span>
            </div>
            <p className="lp-dl-text">Not on the Play Store yet. Install the beta APK directly.</p>
            {href ? (
              <>
                <a className="btn btn-coral lg lp-dl-btn" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : { download: "" })}>
                  <DownloadSimple size={20} weight="bold" /> Download APK
                </a>
                {data?.sha256 ? <Checksum sha={data.sha256} /> : null}
              </>
            ) : (
              <span className="btn btn-coral lg lp-dl-btn" aria-disabled="true" style={{ opacity: 0.6, cursor: "default" }}>
                <DownloadSimple size={20} weight="bold" /> Coming soon
              </span>
            )}
            {data?.available && !data.shared_account ? (
              <div className="lp-android-note" role="note">
                <Info size={18} weight="fill" />
                <span>
                  <strong>Separate beta account.</strong> Data in this build doesn&rsquo;t sync with the web app yet.
                </span>
              </div>
            ) : null}
            <ol className="lp-install">
              <li><span className="lp-num">1</span> Download the APK on your Android phone.</li>
              <li><span className="lp-num">2</span> Open it and allow &ldquo;Install unknown apps&rdquo; for your browser when asked.</li>
              <li>
                <span className="lp-num">3</span>
                {data?.shared_account === false ? (
                  <span>Tap <strong>Install</strong>, then create your beta account in the app.</span>
                ) : (
                  <span>Tap <strong>Install</strong>, then sign in with your HireLog account.</span>
                )}
              </li>
            </ol>
            <p className="lp-android-warn">
              <Warning size={16} weight="fill" /> For experienced users. Only download HireLog from this page.
            </p>
          </article>

          <article className="lp-ios">
            <div className="lp-dl-title">
              <span className="lp-dl-icon light"><AppleLogo size={28} weight="fill" /></span>
              <span>
                <h3>iOS</h3>
                <span className="lp-soon">Coming soon</span>
              </span>
            </div>
            <p className="lp-dl-text">
              The iPhone app is on its way. Until then, open HireLog in Safari and tap <strong>Share → Add to Home Screen</strong>{" "}
              for an app-like experience.
            </p>
            <div className="lp-ios-art" aria-hidden>
              <img src="/icon.png" alt="" width={72} height={72} />
              <span>HireLog for iPhone</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
