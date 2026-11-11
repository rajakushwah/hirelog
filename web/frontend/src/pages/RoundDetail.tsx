import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, DownloadSimple, LinkSimple, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { api, downloadFile } from "../api";
import { AttachmentsSection } from "../components/Attachments";
import { ConfirmSheet, ErrorNote, KV, Spinner, StatusBadge } from "../components/ui";
import { useBack } from "../nav";
import type { Question, Round } from "../types";
import { formatDate, googleCalendarUrl, safeHref } from "../util";

export function RoundDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"round" | Question | null>(null);
  const [calError, setCalError] = useState<unknown>(null);
  const uploadErrors = (location.state as { uploadErrors?: string[] } | null)?.uploadErrors;

  const { data: round, isLoading, error } = useQuery({
    queryKey: ["round", id],
    queryFn: () => api<Round>(`/rounds/${encodeURIComponent(id)}`),
  });
  const back = useBack(round ? `/applications/${round.application_id}` : "/interviews");
  const { data: questions } = useQuery({
    queryKey: ["questions", "round", id],
    queryFn: () => api<Question[]>(`/questions?round_id=${encodeURIComponent(id)}`),
  });

  const del = useMutation({
    mutationFn: async (target: "round" | Question) => {
      if (target === "round") await api(`/rounds/${encodeURIComponent(id)}`, { method: "DELETE" });
      else await api(`/questions/${encodeURIComponent(target.question_id)}`, { method: "DELETE" });
      return target;
    },
    onSuccess: (target) => {
      setConfirm(null);
      qc.invalidateQueries();
      if (target === "round") nav(round ? `/applications/${round.application_id}` : "/interviews", { replace: true });
    },
  });

  if (isLoading) return <Spinner full />;
  if (error || !round) {
    return (
      <div className="page narrow">
        <ErrorNote error={error ?? "Not found"} />
      </div>
    );
  }

  const link = safeHref(round.meeting_link);
  const gcal = googleCalendarUrl(round);

  const downloadIcs = async () => {
    setCalError(null);
    try {
      await downloadFile(`/rounds/${encodeURIComponent(id)}/calendar.ics`, `interview_${round.company_name}_R${round.round_number}.ics`);
    } catch (e) {
      setCalError(e);
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <button className="icon-btn" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => nav(`/rounds/${id}/edit`)} aria-label="Edit round"><PencilSimple size={20} /></button>
        <button className="icon-btn danger" onClick={() => setConfirm("round")} aria-label="Delete round"><Trash size={20} /></button>
      </div>

      <button className="link" style={{ fontSize: 16, fontWeight: 700 }} onClick={() => nav(`/applications/${round.application_id}`)}>
        {round.company_name}
      </button>
      <h1 className="page-title" style={{ marginTop: 4 }}>R{round.round_number} · {round.round_name}</h1>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <StatusBadge status={round.interview_status} kind="interview" />
        <StatusBadge status={round.interview_result} kind="result" />
        <StatusBadge status={round.difficulty || "Medium"} kind="difficulty" />
      </div>

      {uploadErrors?.length ? <div style={{ marginTop: 16 }}><ErrorNote error={`Round saved, but some files failed to upload: ${uploadErrors.join(" · ")}`} /></div> : null}

      <div className="card kv" style={{ marginTop: 16 }}>
        <KV label="Type" value={round.interview_type} />
        <KV label="Date" value={formatDate(round.interview_date)} />
        <KV label="Time" value={round.interview_time} />
        <KV label="Duration" value={round.duration} />
        <KV label="Interviewer" value={[round.interviewer_name, round.interviewer_designation && `(${round.interviewer_designation})`].filter(Boolean).join(" ")} />
        <KV label="Email">
          {round.interviewer_email ? <a className="link" href={`mailto:${encodeURIComponent(round.interviewer_email)}`}>{round.interviewer_email}</a> : "—"}
        </KV>
        <KV label="Platform" value={round.interview_platform} />
        {link ? (
          <a className="row link" href={link} target="_blank" rel="noopener noreferrer" style={{ overflow: "hidden" }}>
            <LinkSimple size={16} />
            <span className="truncate">{round.meeting_link}</span>
          </a>
        ) : null}
        {round.feedback ? <KV label="Feedback" value={round.feedback} multi /> : null}
        {round.notes ? <KV label="Notes" value={round.notes} multi /> : null}
      </div>

      {round.interview_date ? (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn btn-tint sm" onClick={downloadIcs}>
            <DownloadSimple size={16} weight="bold" /> Add to calendar (.ics)
          </button>
          {gcal ? (
            <a className="btn btn-tint sm" href={gcal} target="_blank" rel="noopener noreferrer">
              <CalendarPlus size={16} weight="bold" /> Google Calendar
            </a>
          ) : null}
        </div>
      ) : null}
      <ErrorNote error={calError} />

      <div className="section-head">
        <h2>Questions ({questions?.length ?? 0})</h2>
        <button className="btn btn-primary sm" onClick={() => nav(`/questions/new?round_id=${encodeURIComponent(id)}`)}>
          <Plus size={14} weight="bold" /> Add
        </button>
      </div>
      {(questions?.length ?? 0) === 0 ? (
        <p className="sub" style={{ textAlign: "center", padding: 16 }}>No questions logged yet.</p>
      ) : (
        <div className="stack">
          {questions!.map((q) => (
            <div key={q.question_id} className="q-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="q-category">{q.category}</span>
                <StatusBadge status={q.difficulty} kind="difficulty" />
              </div>
              <span className="q-text">{q.question}</span>
              {q.answer ? <span className="q-answer">{q.answer}</span> : null}
              {q.tags.length ? <div className="row wrap">{q.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div> : null}
              <div className="row">
                <button className="btn btn-secondary sm" onClick={() => nav(`/questions/${q.question_id}/edit`)}>Edit</button>
                <button className="btn sm" style={{ color: "var(--error)" }} onClick={() => setConfirm(q)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AttachmentsSection roundId={id} />

      <ConfirmSheet
        open={!!confirm}
        title={confirm === "round" ? "Delete round?" : "Delete question?"}
        message={confirm === "round" ? "This also removes its questions and attachments." : undefined}
        busy={del.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && del.mutate(confirm)}
      >
        <ErrorNote error={del.error} />
      </ConfirmSheet>
    </div>
  );
}
