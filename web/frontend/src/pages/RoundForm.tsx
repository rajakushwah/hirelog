import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { api, ApiError } from "../api";
import { FilePickers, PendingFiles, uploadAttachment } from "../components/Attachments";
import { ChipRow, ErrorNote, Field, InlineSpinner, Spinner, TextArea } from "../components/ui";
import { DIFFICULTY_LEVELS, INTERVIEW_PLATFORMS, INTERVIEW_RESULTS, INTERVIEW_STATUSES, INTERVIEW_TYPES, type InterviewType } from "../constants";
import { useBack } from "../nav";
import type { Application, Round, RoundInput } from "../types";
import { todayLocal } from "../util";

const EMPTY: RoundInput = {
  application_id: "",
  round_number: 1,
  round_name: "",
  interview_types: ["Technical"],
  interview_date: todayLocal(),
  interview_time: "",
  duration: "",
  interviewer_name: "",
  interviewer_designation: "",
  interviewer_email: "",
  interview_platform: "Google Meet",
  meeting_link: "",
  interview_status: "Scheduled",
  interview_result: "Pending",
  feedback: "",
  difficulty: "Medium",
  notes: "",
};

export function RoundForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const presetApp = params.get("application_id") ?? "";
  const back = useBack(isEdit ? `/rounds/${id}` : presetApp ? `/applications/${presetApp}` : "/interviews");

  const [form, setForm] = useState<RoundInput>(() => ({
    ...EMPTY,
    application_id: presetApp,
    round_number: Number(params.get("round_number")) || 1,
    interview_date: params.get("date") || EMPTY.interview_date,
  }));
  const [pending, setPending] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["round", id],
    queryFn: () => api<Round>(`/rounds/${encodeURIComponent(id!)}`),
    enabled: isEdit,
  });
  const { data: apps } = useQuery({
    queryKey: ["apps", "picker"],
    queryFn: () => api<Application[]>("/applications?sort=updated_desc"),
    enabled: !presetApp,
  });

  useEffect(() => {
    if (!existing) return;
    const next = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof RoundInput)[]) (next as Record<string, unknown>)[k] = existing[k] ?? EMPTY[k];
    setForm(next);
  }, [existing]);

  const set = <K extends keyof RoundInput>(k: K, v: RoundInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fieldErr = (k: string) => (error instanceof ApiError ? error.fields[k] : undefined);
  const canSave = !!form.round_name.trim() && !!form.application_id && form.interview_types.length > 0 && !saving;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const body = { ...form, interview_date: form.interview_date || null };
      const saved = isEdit
        ? await api<Round>(`/rounds/${encodeURIComponent(id!)}`, { method: "PUT", json: body })
        : await api<Round>("/rounds", { json: body });
      const failed: string[] = [];
      for (const f of pending) {
        try {
          await uploadAttachment(saved.round_id, f);
        } catch (err) {
          failed.push(`${f.name}: ${(err as Error).message}`);
        }
      }
      qc.invalidateQueries();
      if (failed.length) {
        // The round is saved; open it so the failed uploads can be retried there.
        nav(`/rounds/${saved.round_id}`, { replace: true, state: { uploadErrors: failed } });
        return;
      }
      nav(isEdit ? `/rounds/${saved.round_id}` : `/applications/${saved.application_id}`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && isLoading) return <Spinner full />;

  return (
    <div className="page narrow">
      <div className="page-head">
        <button className="icon-btn" type="button" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="form-title">{isEdit ? "Edit round" : "New interview round"}</h1>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        {!presetApp && !isEdit ? (
          <div className="field">
            <label className="label" htmlFor="round-app">Application *</label>
            <select id="round-app" className="input" value={form.application_id} onChange={(e) => set("application_id", e.target.value)} required>
              <option value="">Choose an application…</option>
              {(apps ?? []).map((a) => (
                <option key={a.application_id} value={a.application_id}>{a.company_name} — {a.job_role}</option>
              ))}
            </select>
            {apps && apps.length === 0 ? (
              <span className="small">
                You need an application first. <button type="button" className="link" onClick={() => nav("/applications/new")}>Add one</button>
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="form-grid two">
          <Field label="Round name *" value={form.round_name} onChange={(e) => set("round_name", e.target.value)} maxLength={200} required placeholder="e.g. Technical Screening" error={fieldErr("round_name")} autoFocus={!isEdit} />
          <Field label="Round number" type="number" min={1} max={100} value={String(form.round_number)} onChange={(e) => set("round_number", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <span className="label strong">Type (choose one or more)</span>
        <ChipRow multi options={INTERVIEW_TYPES} value={form.interview_types as InterviewType[]} onChange={(v) => set("interview_types", v)} label="Interview types" />
        <div className="form-grid two">
          <Field label="Date" type="date" value={form.interview_date ?? ""} onChange={(e) => set("interview_date", e.target.value)} />
          <Field label="Time" type="time" value={form.interview_time} onChange={(e) => set("interview_time", e.target.value)} />
          <Field label="Duration" value={form.duration} onChange={(e) => set("duration", e.target.value)} maxLength={40} placeholder="e.g. 45 min" />
          <Field label="Interviewer name" value={form.interviewer_name} onChange={(e) => set("interviewer_name", e.target.value)} maxLength={200} />
          <Field label="Interviewer designation" value={form.interviewer_designation} onChange={(e) => set("interviewer_designation", e.target.value)} maxLength={200} />
          <Field label="Interviewer email" type="email" value={form.interviewer_email} onChange={(e) => set("interviewer_email", e.target.value)} maxLength={320} error={fieldErr("interviewer_email")} />
        </div>
        <span className="label strong">Platform</span>
        <ChipRow options={INTERVIEW_PLATFORMS} value={form.interview_platform as (typeof INTERVIEW_PLATFORMS)[number]} onChange={(v) => set("interview_platform", v)} label="Platform" />
        <Field label="Meeting link" value={form.meeting_link} onChange={(e) => set("meeting_link", e.target.value)} maxLength={1000} placeholder="https://" inputMode="url" error={fieldErr("meeting_link")} />
        <span className="label strong">Status</span>
        <ChipRow options={INTERVIEW_STATUSES} value={form.interview_status as (typeof INTERVIEW_STATUSES)[number]} onChange={(v) => set("interview_status", v)} label="Status" />
        <span className="label strong">Result</span>
        <ChipRow options={INTERVIEW_RESULTS} value={form.interview_result as (typeof INTERVIEW_RESULTS)[number]} onChange={(v) => set("interview_result", v)} label="Result" />
        <span className="label strong">Difficulty</span>
        <ChipRow options={DIFFICULTY_LEVELS} value={form.difficulty as (typeof DIFFICULTY_LEVELS)[number]} onChange={(v) => set("difficulty", v)} label="Difficulty" />
        <TextArea label="Overall feedback" value={form.feedback} onChange={(e) => set("feedback", e.target.value)} maxLength={20000} />
        <TextArea label="Personal notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={20000} />

        {!isEdit ? (
          <>
            <span className="label strong">Attachments</span>
            <FilePickers onFiles={(fs) => setPending((p) => [...p, ...fs])} disabled={saving} />
            <PendingFiles files={pending} onRemove={(i) => setPending((p) => p.filter((_, j) => j !== i))} />
          </>
        ) : null}

        <ErrorNote error={error} />
        <button className="btn btn-primary lg block" type="submit" disabled={!canSave} style={{ marginTop: 16 }}>
          {saving ? <InlineSpinner /> : isEdit ? "Save changes" : "Create round"}
        </button>
      </form>
    </div>
  );
}
