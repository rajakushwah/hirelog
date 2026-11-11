import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash } from "@phosphor-icons/react";
import { api, ApiError } from "../api";
import { ChipRow, ConfirmSheet, ErrorNote, Field, InlineSpinner, Spinner, TextArea } from "../components/ui";
import { DIFFICULTY_LEVELS, QUESTION_CATEGORIES } from "../constants";
import { useBack } from "../nav";
import type { Question, QuestionInput, Round } from "../types";

type Form = Omit<QuestionInput, "tags"> & { tags: string };

const EMPTY: Form = { round_id: null, application_id: null, question: "", answer: "", category: "Python", difficulty: "Medium", tags: "", notes: "" };

export function QuestionForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const presetRound = params.get("round_id");
  const back = useBack(presetRound ? `/rounds/${presetRound}` : "/questions");

  const [form, setForm] = useState<Form>(() => ({ ...EMPTY, round_id: presetRound, application_id: params.get("application_id") }));
  const [confirm, setConfirm] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["question", id],
    queryFn: () => api<Question>(`/questions/${encodeURIComponent(id!)}`),
    enabled: isEdit,
  });
  const { data: rounds } = useQuery({ queryKey: ["rounds", "all"], queryFn: () => api<Round[]>("/rounds") });

  useEffect(() => {
    if (existing) setForm({ ...existing, tags: existing.tags.join(", ") });
  }, [existing]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const tags = [...new Set(form.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean))];
      const body: QuestionInput = {
        round_id: form.round_id || null,
        application_id: form.round_id ? null : form.application_id || null,
        question: form.question,
        answer: form.answer,
        category: form.category,
        difficulty: form.difficulty,
        tags,
        notes: form.notes,
      };
      return isEdit
        ? api<Question>(`/questions/${encodeURIComponent(id!)}`, { method: "PUT", json: body })
        : api<Question>("/questions", { json: body });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      back();
    },
  });
  const del = useMutation({
    mutationFn: () => api(`/questions/${encodeURIComponent(id!)}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries();
      nav("/questions", { replace: true });
    },
  });

  const fieldErr = (k: string) => (save.error instanceof ApiError ? save.error.fields[k] : undefined);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.question.trim() && !save.isPending) save.mutate();
  };

  if (isEdit && isLoading) return <Spinner full />;

  return (
    <div className="page narrow">
      <div className="page-head">
        <button className="icon-btn" type="button" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <h1 className="form-title grow">{isEdit ? "Edit question" : "Log a question"}</h1>
        {isEdit ? (
          <button className="icon-btn danger" type="button" onClick={() => setConfirm(true)} aria-label="Delete question"><Trash size={20} /></button>
        ) : null}
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="label" htmlFor="q-round">Interview round</label>
          <select
            id="q-round"
            className="input"
            value={form.round_id ?? ""}
            onChange={(e) => {
              const r = rounds?.find((x) => x.round_id === e.target.value);
              setForm((f) => ({ ...f, round_id: r?.round_id ?? null, application_id: r?.application_id ?? f.application_id }));
            }}
          >
            <option value="">Not linked to a round</option>
            {(rounds ?? []).map((r) => (
              <option key={r.round_id} value={r.round_id}>{r.company_name} · R{r.round_number} {r.round_name}</option>
            ))}
          </select>
        </div>
        <TextArea label="Question *" value={form.question} onChange={(e) => set("question", e.target.value)} maxLength={5000} required autoFocus={!isEdit} error={fieldErr("question")} />
        <TextArea label="Your answer" value={form.answer} onChange={(e) => set("answer", e.target.value)} maxLength={20000} />
        <span className="label strong">Category</span>
        <ChipRow options={QUESTION_CATEGORIES} value={form.category as (typeof QUESTION_CATEGORIES)[number]} onChange={(v) => set("category", v)} wrap label="Category" />
        <span className="label strong">Difficulty</span>
        <ChipRow options={DIFFICULTY_LEVELS} value={form.difficulty as (typeof DIFFICULTY_LEVELS)[number]} onChange={(v) => set("difficulty", v)} label="Difficulty" />
        <Field label="Tags (comma separated)" value={form.tags} onChange={(e) => set("tags", e.target.value)} maxLength={900} placeholder="e.g. arrays, recursion" error={fieldErr("tags")} />
        <TextArea label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={20000} />
        <ErrorNote error={save.error} />
        <button className="btn btn-primary lg block" type="submit" disabled={!form.question.trim() || save.isPending} style={{ marginTop: 16 }}>
          {save.isPending ? <InlineSpinner /> : isEdit ? "Save changes" : "Save question"}
        </button>
      </form>
      <ConfirmSheet open={confirm} title="Delete question?" busy={del.isPending} onCancel={() => setConfirm(false)} onConfirm={() => del.mutate()}>
        <ErrorNote error={del.error} />
      </ConfirmSheet>
    </div>
  );
}
