import { useState } from "react";
import { FilePdf, Table } from "@phosphor-icons/react";
import { downloadFile } from "../api";
import { safeName, todayLocal } from "../util";
import { InlineSpinner, Sheet } from "./ui";

type Kind = "sheet" | "pdf";

function useExport() {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = async (kind: Kind, applicationId: string | undefined, base: string, okText: (k: Kind) => string) => {
    setBusy(kind);
    setMsg(null);
    const q = applicationId ? `?application_id=${encodeURIComponent(applicationId)}` : "";
    try {
      await downloadFile(`/export/${kind}${q}`, `${base}.${kind === "sheet" ? "xlsx" : "pdf"}`);
      setMsg({ text: okText(kind), ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message || "Couldn't create the file. Try again.", ok: false });
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, setMsg, run };
}

export function ExportCard() {
  const { busy, msg, run } = useExport();
  const go = (k: Kind) =>
    run(k, undefined, `HireLog_${k === "sheet" ? "All" : "Report"}_${todayLocal()}`, (kind) =>
      kind === "sheet" ? "Spreadsheet downloaded. Open it in Excel or import it into Google Sheets." : "PDF report downloaded.",
    );
  return (
    <div className="settings-group">
      <button className="settings-row" onClick={() => go("sheet")} disabled={!!busy}>
        <span className="icon-box sm"><Table size={20} weight="bold" /></span>
        <span className="grow">
          <strong>Export everything</strong>
          <span className="small">All applications, rounds, questions and attachments in separate tabs. To share one company only, use Export on that application.</span>
        </span>
        {busy === "sheet" ? <InlineSpinner /> : null}
      </button>
      <div className="divider" />
      <button className="settings-row" onClick={() => go("pdf")} disabled={!!busy}>
        <span className="icon-box sm"><FilePdf size={20} weight="bold" /></span>
        <span className="grow">
          <strong>Full PDF report</strong>
          <span className="small">Your full interview journey, with image and PDF attachments included.</span>
        </span>
        {busy === "pdf" ? <InlineSpinner /> : null}
      </button>
      {msg ? (
        <p className="small" role="status" style={{ color: msg.ok ? "var(--success)" : "var(--error)", padding: "0 16px 16px", margin: 0 }}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

export function ExportApplicationSheet({
  open,
  onClose,
  applicationId,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  companyName: string;
}) {
  const { busy, msg, setMsg, run } = useExport();
  const go = (k: Kind) =>
    run(k, applicationId, `HireLog_${safeName(companyName)}_${todayLocal()}`, (kind) =>
      `${kind === "sheet" ? "Spreadsheet" : "PDF"} for ${companyName} is ready.`,
    );
  const close = () => {
    if (busy) return;
    setMsg(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} label={`Export ${companyName}`}>
      <h2>Export {companyName}</h2>
      <p className="small" style={{ margin: 0 }}>Only this application, its interview rounds, questions and attachments are included.</p>
      <button className="sheet-option" onClick={() => go("sheet")} disabled={!!busy}>
        <span className="icon-box sm"><Table size={20} weight="bold" /></span>
        <span className="grow">
          <strong>Excel spreadsheet</strong>
          <span className="small">Opens in Excel or Google Sheets</span>
        </span>
        {busy === "sheet" ? <InlineSpinner /> : null}
      </button>
      <button className="sheet-option" onClick={() => go("pdf")} disabled={!!busy}>
        <span className="icon-box sm"><FilePdf size={20} weight="bold" /></span>
        <span className="grow">
          <strong>PDF report</strong>
          <span className="small">Full interview experience with image and PDF attachments</span>
        </span>
        {busy === "pdf" ? <InlineSpinner /> : null}
      </button>
      {msg ? <p className="small" role="status" style={{ color: msg.ok ? "var(--success)" : "var(--error)", margin: 0 }}>{msg.text}</p> : null}
      <button className="btn btn-secondary block" onClick={close}>Done</button>
    </Sheet>
  );
}
