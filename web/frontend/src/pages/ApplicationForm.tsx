import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { useBack } from "../nav";
import { api, ApiError } from "../api";
import { APPLICATION_STATUSES, JOB_SOURCES, JOB_TYPES } from "../constants";
import { ChipRow, ErrorNote, Field, InlineSpinner, Spinner, TextArea } from "../components/ui";
import type { Application, ApplicationInput } from "../types";
import { todayLocal } from "../util";

const EMPTY: ApplicationInput = {
  company_name: "",
  company_website: "",
  job_role: "",
  job_description: "",
  job_location: "",
  job_type: "Full-time",
  employment_type: "",
  applied_date: todayLocal(),
  job_source: "LinkedIn",
  recruiter_name: "",
  recruiter_email: "",
  recruiter_phone: "",
  expected_ctc: "",
  offered_ctc: "",
  notice_period: "",
  application_status: "Applied",
};

export function ApplicationForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const nav = useNavigate();
  const back = useBack(id ? `/applications/${id}` : "/applications");
  const qc = useQueryClient();
  const [form, setForm] = useState<ApplicationInput>(EMPTY);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["app", id],
    queryFn: () => api<Application>(`/applications/${encodeURIComponent(id!)}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing) return;
    const next = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof ApplicationInput)[]) next[k] = existing[k] ?? EMPTY[k];
    setForm(next);
  }, [existing]);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? api<Application>(`/applications/${encodeURIComponent(id!)}`, { method: "PUT", json: form })
        : api<Application>("/applications", { json: form }),
    onSuccess: (saved) => {
      qc.invalidateQueries();
      nav(`/applications/${saved.application_id}`, { replace: true });
    },
  });

  const set = <K extends keyof ApplicationInput>(k: K, v: ApplicationInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fieldErr = (k: string) => (save.error instanceof ApiError ? save.error.fields[k] : undefined);
  const canSave = form.company_name.trim() && form.job_role.trim() && !save.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSave) save.mutate();
  };

  if (isEdit && isLoading) return <Spinner full />;

  return (
    <div className="page narrow">
      <div className="page-head">
        <button className="icon-btn" type="button" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="form-title">{isEdit ? "Edit application" : "New application"}</h1>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <div className="form-grid two">
          <Field label="Company name *" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} maxLength={200} required error={fieldErr("company_name")} autoFocus={!isEdit} />
          <Field label="Job role *" value={form.job_role} onChange={(e) => set("job_role", e.target.value)} maxLength={200} required error={fieldErr("job_role")} />
          <Field label="Location" value={form.job_location} onChange={(e) => set("job_location", e.target.value)} maxLength={200} />
          <Field label="Company website" value={form.company_website} onChange={(e) => set("company_website", e.target.value)} maxLength={1000} placeholder="https://" inputMode="url" error={fieldErr("company_website")} />
        </div>
        <span className="label strong">Job type</span>
        <ChipRow options={JOB_TYPES} value={form.job_type as (typeof JOB_TYPES)[number]} onChange={(v) => set("job_type", v)} label="Job type" />
        <span className="label strong">Source</span>
        <ChipRow options={JOB_SOURCES} value={form.job_source as (typeof JOB_SOURCES)[number]} onChange={(v) => set("job_source", v)} label="Source" />
        <span className="label strong">Status</span>
        <ChipRow options={APPLICATION_STATUSES} value={form.application_status as (typeof APPLICATION_STATUSES)[number]} onChange={(v) => set("application_status", v)} label="Status" />

        <div className="form-grid two">
          <Field label="Applied date" type="date" value={form.applied_date} onChange={(e) => set("applied_date", e.target.value)} error={fieldErr("applied_date")} />
          <Field label="Employment type" value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)} maxLength={200} placeholder="e.g. Permanent, C2H" />
          <Field label="Recruiter name" value={form.recruiter_name} onChange={(e) => set("recruiter_name", e.target.value)} maxLength={200} />
          <Field label="Recruiter email" type="email" value={form.recruiter_email} onChange={(e) => set("recruiter_email", e.target.value)} maxLength={320} error={fieldErr("recruiter_email")} />
          <Field label="Recruiter phone" type="tel" value={form.recruiter_phone} onChange={(e) => set("recruiter_phone", e.target.value)} maxLength={40} error={fieldErr("recruiter_phone")} />
          <Field label="Notice period" value={form.notice_period} onChange={(e) => set("notice_period", e.target.value)} maxLength={200} />
          <Field label="Expected CTC" value={form.expected_ctc} onChange={(e) => set("expected_ctc", e.target.value)} maxLength={200} />
          <Field label="Offered CTC" value={form.offered_ctc} onChange={(e) => set("offered_ctc", e.target.value)} maxLength={200} />
        </div>
        <TextArea label="Description / notes" value={form.job_description} onChange={(e) => set("job_description", e.target.value)} maxLength={20000} rows={5} />

        <ErrorNote error={save.error} />
        <button className="btn btn-primary lg block" type="submit" disabled={!canSave} style={{ marginTop: 16 }}>
          {save.isPending ? <InlineSpinner /> : isEdit ? "Save changes" : "Create application"}
        </button>
      </form>
    </div>
  );
}
