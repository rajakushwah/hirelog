import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Briefcase, ChatCircleText, MagnifyingGlass, VideoCamera } from "@phosphor-icons/react";
import { api } from "../api";
import { EmptyState, ErrorNote, Spinner, StatusBadge } from "../components/ui";
import type { Application, Question, Round } from "../types";
import { formatDate } from "../util";

export function Search() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const enabled = query.length >= 2;

  const { data, isFetching, error } = useQuery({
    queryKey: ["search", query],
    queryFn: async () => {
      const p = `q=${encodeURIComponent(query)}&limit=20`;
      const [apps, rounds, questions] = await Promise.all([
        api<Application[]>(`/applications?${p}`),
        api<Round[]>(`/rounds?${p}`),
        api<Question[]>(`/questions?${p}`),
      ]);
      return { apps, rounds, questions };
    },
    enabled,
    placeholderData: keepPreviousData,
  });

  const empty = data && !data.apps.length && !data.rounds.length && !data.questions.length;

  return (
    <div className="page">
      <h1 className="page-title">Search</h1>
      <label className="search" style={{ marginTop: 12 }}>
        <MagnifyingGlass size={18} />
        <span className="sr-only">Search everything</span>
        <input autoFocus placeholder="Companies, roles, interviewers, questions…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
      </label>
      {!enabled ? (
        <EmptyState title="Search everything" subtitle="Type at least 2 characters." icon={<MagnifyingGlass size={28} weight="bold" />} />
      ) : error ? (
        <ErrorNote error={error} />
      ) : !data && isFetching ? (
        <Spinner />
      ) : empty ? (
        <EmptyState title="No results" subtitle={`Nothing matched “${query}”.`} icon={<MagnifyingGlass size={28} weight="bold" />} />
      ) : data ? (
        <>
          {data.apps.length ? (
            <>
              <div className="section-head"><h2>Applications ({data.apps.length})</h2></div>
              <div className="list" style={{ paddingTop: 0 }}>
                {data.apps.map((a) => (
                  <button key={a.application_id} className="list-card" onClick={() => nav(`/applications/${a.application_id}`)}>
                    <span className="icon-box"><Briefcase size={22} weight="fill" /></span>
                    <span className="grow">
                      <span className="company truncate">{a.company_name}</span>
                      <span className="role truncate">{a.job_role}</span>
                    </span>
                    <StatusBadge status={a.application_status} kind="application" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {data.rounds.length ? (
            <>
              <div className="section-head"><h2>Interview rounds ({data.rounds.length})</h2></div>
              <div className="list" style={{ paddingTop: 0 }}>
                {data.rounds.map((r) => (
                  <button key={r.round_id} className="list-card" onClick={() => nav(`/rounds/${r.round_id}`)}>
                    <span className="icon-box"><VideoCamera size={22} weight="fill" /></span>
                    <span className="grow">
                      <span className="company truncate">{r.company_name}</span>
                      <span className="role truncate">R{r.round_number} · {r.round_name}</span>
                      <span className="meta">{formatDate(r.interview_date)}</span>
                    </span>
                    <StatusBadge status={r.interview_status} kind="interview" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {data.questions.length ? (
            <>
              <div className="section-head"><h2>Questions ({data.questions.length})</h2></div>
              <div className="list" style={{ paddingTop: 0 }}>
                {data.questions.map((x) => (
                  <button key={x.question_id} className="list-card" onClick={() => nav(`/questions/${x.question_id}/edit`)}>
                    <span className="icon-box"><ChatCircleText size={22} weight="fill" /></span>
                    <span className="grow">
                      <span className="company truncate">{x.question}</span>
                      <span className="meta">{x.category}</span>
                    </span>
                    <StatusBadge status={x.difficulty} kind="difficulty" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
