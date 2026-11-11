import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toBlob } from "html-to-image";
import { ArrowLeft, Confetti, Copy, DownloadSimple, ShareNetwork } from "@phosphor-icons/react";
import { api, saveBlob } from "../api";
import { InlineSpinner, Spinner } from "../components/ui";
import { useBack } from "../nav";
import type { Application, Question, Round } from "../types";
import { daysBetween, safeName } from "../util";

export function OfferCard() {
  const { id = "" } = useParams();
  const back = useBack(`/applications/${id}`);
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const { data: app } = useQuery({ queryKey: ["app", id], queryFn: () => api<Application>(`/applications/${encodeURIComponent(id)}`) });
  const { data: rounds } = useQuery({
    queryKey: ["rounds", "for", id],
    queryFn: () => api<Round[]>(`/rounds?application_id=${encodeURIComponent(id)}`),
  });
  const { data: questions } = useQuery({
    queryKey: ["questions", "app", id],
    queryFn: () => api<Question[]>(`/questions?application_id=${encodeURIComponent(id)}`),
  });

  if (!app || !rounds) return <Spinner full />;

  const days = daysBetween(app.applied_date, app.offer_date || app.updated_at);
  const qCount = questions?.length ?? 0;
  const passed = rounds.filter((r) => r.interview_result === "Passed").length;
  const accepted = app.application_status === "Offer Accepted";
  const headline = accepted ? "I'm starting a new position!" : "I received an offer!";
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const postText =
    `${headline} 🎉\n\nThrilled to share that I ${accepted ? "have accepted an offer" : "received an offer"} from ${app.company_name} for the role of ${app.job_role}.\n\n` +
    `My journey: ${plural(rounds.length, "interview round")}${days !== null ? ` over ${plural(days, "day")}` : ""}` +
    `${qCount ? `, ${plural(qCount, "question")} tackled` : ""}.\n\nGrateful to everyone who supported me along the way! #NewJob #Hiring #CareerGrowth`;

  const fileName = `Offer_${safeName(app.company_name)}.png`;

  const renderImage = async (): Promise<Blob> => {
    const blob = await toBlob(cardRef.current!, { pixelRatio: 2, cacheBust: true });
    if (!blob) throw new Error("render failed");
    return blob;
  };

  const downloadImage = async () => {
    setBusy(true);
    setNote(null);
    try {
      saveBlob(await renderImage(), fileName);
      setNote("Image downloaded. Attach it to your LinkedIn post and use the text below as the caption.");
    } catch {
      setNote("Couldn't create the image. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    setNote(null);
    try {
      const file = new File([await renderImage()], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: postText });
      } else {
        await copyText();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Sharing isn't available here. Download the image instead.");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(postText);
      setNote("Post text copied. Paste it into LinkedIn.");
    } catch {
      setNote("Select the suggested post below and copy it.");
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <button className="icon-btn" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="form-title">Share your offer</h1>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <div ref={cardRef} className="offer-card">
          <span className="offer-badge">
            <Confetti size={16} weight="fill" />
            {accepted ? "OFFER ACCEPTED" : "OFFER RECEIVED"}
          </span>
          <span style={{ color: "#E27357", fontSize: 16, fontWeight: 800 }}>{headline}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, lineHeight: "38px", overflowWrap: "anywhere" }}>{app.company_name}</span>
            <span style={{ color: "#CFE3D6", fontSize: 16, fontWeight: 600 }}>{app.job_role}</span>
          </span>
          <div className="offer-stats">
            <OfferStat value={String(rounds.length)} label={rounds.length === 1 ? "round" : "rounds"} />
            <span className="offer-divider" />
            <OfferStat value={days !== null ? String(days) : "—"} label="days to offer" />
            <span className="offer-divider" />
            <OfferStat value={String(qCount)} label={qCount === 1 ? "question" : "questions"} />
          </div>
          {rounds.length > 0 ? (
            <div className="stack" style={{ gap: 8 }}>
              {rounds.slice(0, 6).map((r, i) => (
                <span key={r.round_id} className="offer-step">
                  <span className={`offer-dot${r.interview_result === "Passed" ? " passed" : ""}`}>{i + 1}</span>
                  <span className="truncate">{r.round_name}</span>
                </span>
              ))}
              {rounds.length > 6 ? <span style={{ color: "#CFE3D6", fontSize: 12, marginLeft: 36 }}>+{rounds.length - 6} more rounds</span> : null}
            </div>
          ) : null}
          <span style={{ color: "#CFE3D6", fontSize: 12, marginTop: 8 }}>
            {passed ? `${plural(passed, "round")} cleared · ` : ""}Tracked with HireLog
          </span>
        </div>

        <button className="btn btn-primary lg block" onClick={downloadImage} disabled={busy}>
          {busy ? <InlineSpinner /> : <><DownloadSimple size={18} weight="bold" /> Download image</>}
        </button>
        <div className="row">
          <button className="btn btn-secondary block" onClick={share} disabled={busy} style={{ flex: 1 }}>
            <ShareNetwork size={18} /> Share
          </button>
          <button className="btn btn-secondary block" onClick={copyText} style={{ flex: 1 }}>
            <Copy size={18} /> Copy post text
          </button>
        </div>
        {note ? <p className="small" role="status" style={{ textAlign: "center", margin: 0 }}>{note}</p> : null}

        <div className="card stack" style={{ gap: 8 }}>
          <span className="label strong" style={{ marginTop: 0 }}>Suggested LinkedIn post</span>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: "20px" }}>{postText}</p>
        </div>
      </div>
    </div>
  );
}

function OfferStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="offer-stat">
      <span style={{ fontSize: 24, fontWeight: 800 }}>{value}</span>
      <span style={{ color: "#CFE3D6", fontSize: 12 }}>{label}</span>
    </span>
  );
}
