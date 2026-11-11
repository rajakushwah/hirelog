import { useDeferredValue, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CaretDown, CaretUp, ChatCircleText, MagnifyingGlass, PencilSimple, Plus } from "@phosphor-icons/react";
import { api } from "../api";
import { ChipRow, EmptyState, ErrorNote, Spinner, StatusBadge } from "../components/ui";
import { DIFFICULTY_LEVELS, QUESTION_CATEGORIES } from "../constants";
import type { Application, Question, Round } from "../types";

const CATEGORIES = ["All", ...QUESTION_CATEGORIES] as const;
const DIFFICULTIES = ["All", ...DIFFICULTY_LEVELS] as const;

export function Questions() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("All");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["questions", "list", query, category, difficulty],
    queryFn: () => {
      const p = new URLSearchParams({ q: query });
      if (category !== "All") p.set("category", category);
      if (difficulty !== "All") p.set("difficulty", difficulty);
      return api<Question[]>(`/questions?${p.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const { data: rounds } = useQuery({ queryKey: ["rounds", "all"], queryFn: () => api<Round[]>("/rounds") });
  const { data: apps } = useQuery({ queryKey: ["apps", "all"], queryFn: () => api<Application[]>("/applications") });

  const label = useMemo(() => {
    const r = new Map((rounds ?? []).map((x) => [x.round_id, `${x.company_name} · R${x.round_number} ${x.round_name}`]));
    const a = new Map((apps ?? []).map((x) => [x.application_id, x.company_name]));
    return (qn: Question) => (qn.round_id && r.get(qn.round_id)) || (qn.application_id && a.get(qn.application_id)) || "General";
  }, [rounds, apps]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title grow">Question Bank</h1>
        <button className="btn btn-primary sm" onClick={() => nav("/questions/new")}>
          <Plus size={16} weight="bold" /> Add question
        </button>
      </div>
      <label className="search">
        <MagnifyingGlass size={18} />
        <span className="sr-only">Search questions</span>
        <input placeholder="Search questions, answers or notes" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
      </label>
      <ChipRow options={CATEGORIES} value={category} onChange={setCategory} label="Category" />
      <ChipRow options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} label="Difficulty" />

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : !data?.length ? (
        <EmptyState
          title="No questions yet"
          subtitle="Log questions you were asked to build your personal prep bank."
          icon={<ChatCircleText size={28} weight="fill" />}
          actionLabel="Add question"
          onAction={() => nav("/questions/new")}
        />
      ) : (
        <div className="list">
          {data.map((qn) => {
            const expanded = open.has(qn.question_id);
            return (
              <div key={qn.question_id} className="q-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="q-category">{qn.category}</span>
                  <div className="row">
                    <StatusBadge status={qn.difficulty} kind="difficulty" />
                    <button className="icon-btn" onClick={() => nav(`/questions/${qn.question_id}/edit`)} aria-label="Edit question">
                      <PencilSimple size={16} />
                    </button>
                  </div>
                </div>
                <span className="q-text">{qn.question}</span>
                <span className="small">{label(qn)}</span>
                {qn.answer || qn.notes ? (
                  <>
                    <button className="q-expand" onClick={() => toggle(qn.question_id)} aria-expanded={expanded}>
                      {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />} {expanded ? "Hide answer" : "Show answer"}
                    </button>
                    {expanded ? (
                      <>
                        {qn.answer ? <span className="q-answer">{qn.answer}</span> : null}
                        {qn.notes ? <span className="small" style={{ whiteSpace: "pre-wrap" }}>Notes: {qn.notes}</span> : null}
                      </>
                    ) : null}
                  </>
                ) : null}
                {qn.tags.length ? <div className="row wrap">{qn.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
