import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Confetti, Export, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useBack } from "../nav";
import { api } from "../api";
import { ExportApplicationSheet } from "../components/Exports";
import { ConfirmSheet, EmptyState, ErrorNote, KV, Spinner, StatusBadge } from "../components/ui";
import type { Application, Round } from "../types";
import { formatDate, safeHref } from "../util";

export function ApplicationDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const back = useBack("/applications");
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: app, isLoading, error } = useQuery({
    queryKey: ["app", id],
    queryFn: () => api<Application>(`/applications/${encodeURIComponent(id)}`),
  });
  const { data: rounds } = useQuery({
    queryKey: ["rounds", "for", id],
    queryFn: () => api<Round[]>(`/rounds?application_id=${encodeURIComponent(id)}`),
  });

  const del = useMutation({
    mutationFn: () => api(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries();
      nav("/applications", { replace: true });
    },
  });

  if (isLoading) return <Spinner full />;
  if (error || !app) {
    return (
      <div className="page narrow">
        <ErrorNote error={error ?? "Not found"} />
      </div>
    );
  }

  const offer = app.application_status === "Offer Received" || app.application_status === "Offer Accepted";
  const website = safeHref(app.company_website);
  const nextRound = (rounds?.reduce((m, r) => Math.max(m, r.round_number), 0) ?? 0) + 1;

  return (
    <div className="page narrow">
      <div className="page-head">
        <button className="icon-btn" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <span className="spacer" />
        <button className="btn btn-tint sm" onClick={() => setExportOpen(true)}>
          <Export size={18} weight="bold" /> Export
        </button>
        <button className="icon-btn" onClick={() => nav(`/applications/${id}/edit`)} aria-label="Edit"><PencilSimple size={20} /></button>
        <button className="icon-btn danger" onClick={() => setConfirmOpen(true)} aria-label="Delete"><Trash size={20} /></button>
      </div>

      <div className="hero">
        <h1>{app.company_name}</h1>
        <span className="role" style={{ fontSize: 16, marginBottom: 8 }}>{app.job_role}</span>
        <StatusBadge status={app.application_status} kind="application" />
      </div>

      {offer ? (
        <button className="offer-banner" onClick={() => nav(`/applications/${id}/offer`)}>
          <Confetti size={22} weight="fill" />
          <span className="grow">
            <strong style={{ fontSize: 16 }}>Congratulations!</strong>
            <span style={{ fontSize: 12 }}>Create a card to share your offer on LinkedIn</span>
          </span>
        </button>
      ) : null}

      <div className="card kv">
        <KV label="Location" value={app.job_location} />
        <KV label="Job type" value={app.job_type} />
        {app.employment_type ? <KV label="Employment type" value={app.employment_type} /> : null}
        <KV label="Source" value={app.job_source} />
        <KV label="Applied on" value={formatDate(app.applied_date)} />
        {website ? (
          <KV label="Website">
            <a className="link" href={website} target="_blank" rel="noopener noreferrer">{app.company_website}</a>
          </KV>
        ) : null}
        <KV label="Recruiter" value={app.recruiter_name} />
        <KV label="Recruiter email">
          {app.recruiter_email ? <a className="link" href={`mailto:${encodeURIComponent(app.recruiter_email)}`}>{app.recruiter_email}</a> : "—"}
        </KV>
        {app.recruiter_phone ? <KV label="Recruiter phone" value={app.recruiter_phone} /> : null}
        <KV label="Expected CTC" value={app.expected_ctc} />
        <KV label="Offered CTC" value={app.offered_ctc} />
        <KV label="Notice period" value={app.notice_period} />
        {app.job_description ? <KV label="Description" value={app.job_description} multi /> : null}
      </div>

      <div className="section-head">
        <h2>Interview rounds</h2>
        <button
          className="btn btn-primary sm"
          onClick={() => nav(`/rounds/new?application_id=${encodeURIComponent(id)}&round_number=${nextRound}`)}
        >
          <Plus size={16} weight="bold" /> Add round
        </button>
      </div>

      {(rounds?.length ?? 0) === 0 ? (
        <EmptyState title="No rounds yet" subtitle="Schedule your first interview round." />
      ) : (
        <div className="timeline">
          {rounds!.map((r, idx) => (
            <button key={r.round_id} className="timeline-row" onClick={() => nav(`/rounds/${r.round_id}`)}>
              <span className="dot-col">
                <span className="dot">{r.round_number}</span>
                {idx < rounds!.length - 1 ? <span className="line" /> : null}
              </span>
              <span className="round-card">
                <span className="company" style={{ display: "block" }}>{r.round_name}</span>
                <span className="meta" style={{ display: "block" }}>
                  {r.interview_type} · {formatDate(r.interview_date)} {r.interview_time}
                </span>
                <span className="row wrap" style={{ marginTop: 8 }}>
                  <StatusBadge status={r.interview_status} kind="interview" />
                  <StatusBadge status={r.interview_result} kind="result" />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <ConfirmSheet
        open={confirmOpen}
        title="Delete application?"
        message="This removes all its rounds, questions and attachments."
        busy={del.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => del.mutate()}
      >
        <ErrorNote error={del.error} />
      </ConfirmSheet>
      <ExportApplicationSheet open={exportOpen} onClose={() => setExportOpen(false)} applicationId={id} companyName={app.company_name} />
    </div>
  );
}
