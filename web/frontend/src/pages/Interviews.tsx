import { useDeferredValue, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarBlank, CaretLeft, CaretRight, ListBullets, MagnifyingGlass, Plus, VideoCamera } from "@phosphor-icons/react";
import { api } from "../api";
import { ChipRow, EmptyState, ErrorNote, Spinner, StatusBadge } from "../components/ui";
import { statusColor, useTheme } from "../theme";
import type { Round } from "../types";
import { formatDate, parseIsoDate, toIsoDate, todayLocal } from "../util";

const FILTERS = ["All", "Upcoming", "Completed", "Rescheduled", "Cancelled"] as const;
type Filter = (typeof FILTERS)[number];

export function Interviews() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "calendar" ? "calendar" : "list";
  const initial = params.get("filter") as Filter | null;
  const [filter, setFilter] = useState<Filter>(initial && FILTERS.includes(initial) ? initial : "Upcoming");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());

  const setView = (v: "list" | "calendar") => setParams(v === "calendar" ? { view: v } : {}, { replace: true });

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title grow">Interviews</h1>
        <button className="btn btn-primary sm" onClick={() => nav("/rounds/new")}>
          <Plus size={16} weight="bold" /> Schedule
        </button>
      </div>
      <div className="segment" style={{ maxWidth: 320, marginBottom: 8 }}>
        <button className={view === "list" ? "selected" : ""} onClick={() => setView("list")}>
          <ListBullets size={16} /> List
        </button>
        <button className={view === "calendar" ? "selected" : ""} onClick={() => setView("calendar")}>
          <CalendarBlank size={16} /> Calendar
        </button>
      </div>
      {view === "list" ? (
        <>
          <label className="search" style={{ marginTop: 8 }}>
            <MagnifyingGlass size={18} />
            <span className="sr-only">Search interviews</span>
            <input placeholder="Search company, role, round or interviewer" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
          </label>
          <ChipRow options={FILTERS} value={filter} onChange={setFilter} label="Filter interviews" />
          <RoundList filter={filter} q={query} />
        </>
      ) : (
        <CalendarView />
      )}
    </div>
  );
}

function RoundList({ filter, q }: { filter: Filter; q: string }) {
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rounds", "list", filter, q],
    queryFn: () => {
      const p = new URLSearchParams({ q });
      if (filter === "Upcoming") {
        p.set("upcoming", "true");
        p.set("today", todayLocal());
      } else if (filter !== "All") p.set("status", filter);
      return api<Round[]>(`/rounds?${p.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.length) return <EmptyState title="No interviews" subtitle="Scheduled rounds will appear here." icon={<VideoCamera size={28} weight="fill" />} />;
  return (
    <div className="list">
      {data.map((r) => <RoundCard key={r.round_id} r={r} onClick={() => nav(`/rounds/${r.round_id}`)} />)}
    </div>
  );
}

function RoundCard({ r, onClick }: { r: Round; onClick: () => void }) {
  return (
    <button className="list-card" onClick={onClick}>
      <span className="icon-box"><VideoCamera size={22} weight="fill" /></span>
      <span className="grow">
        <span className="company truncate">{r.company_name}</span>
        <span className="role truncate">R{r.round_number} · {r.round_name}</span>
        <span className="meta">{formatDate(r.interview_date)}{r.interview_time ? ` · ${r.interview_time}` : ""}</span>
      </span>
      <StatusBadge status={r.interview_status} kind="interview" />
    </button>
  );
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}

function CalendarView() {
  const nav = useNavigate();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string>(todayLocal());

  const days = useMemo(() => {
    if (mode === "week") {
      const s = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }, [cursor, mode]);

  const from = toIsoDate(days[0]);
  const to = toIsoDate(days[days.length - 1]);
  const { data, isLoading } = useQuery({
    queryKey: ["rounds", "range", from, to],
    queryFn: () => api<Round[]>(`/rounds?date_from=${from}&date_to=${to}`),
    placeholderData: keepPreviousData,
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Round[]>();
    for (const r of data ?? []) {
      if (!r.interview_date) continue;
      const list = m.get(r.interview_date) ?? [];
      list.push(r);
      m.set(r.interview_date, list);
    }
    return m;
  }, [data]);

  const move = (dir: number) => {
    const d = new Date(cursor);
    if (mode === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir, 1);
    setCursor(d);
  };

  const title =
    mode === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  const today = todayLocal();
  const selectedRounds = byDay.get(selected) ?? [];

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="cal-head">
        <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous"><CaretLeft size={20} /></button>
        <h2>{title}</h2>
        <button className="btn btn-secondary sm" onClick={() => { setCursor(new Date()); setSelected(today); }}>Today</button>
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value as "month" | "week")} aria-label="Calendar view">
          <option value="month">Month</option>
          <option value="week">Week</option>
        </select>
        <button className="icon-btn" onClick={() => move(1)} aria-label="Next"><CaretRight size={20} /></button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {days.map((d) => {
          const iso = toIsoDate(d);
          const items = byDay.get(iso) ?? [];
          const cls = [
            "cal-day",
            mode === "week" ? "week" : "",
            mode === "month" && d.getMonth() !== cursor.getMonth() ? "other" : "",
            iso === today ? "today" : "",
            iso === selected ? "selected" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={iso} className={cls} onClick={() => setSelected(iso)} aria-label={`${d.toDateString()}, ${items.length} interviews`}>
              <span className="cal-num">{d.getDate()}</span>
              {items.slice(0, mode === "week" ? 6 : 3).map((r) => {
                const c = statusColor(colors, r.interview_status, "interview");
                return (
                  <span key={r.round_id} className="cal-ev" style={{ background: c.bg, color: c.fg }}>
                    {r.interview_time ? `${r.interview_time} ` : ""}{r.company_name}
                  </span>
                );
              })}
              {items.length > (mode === "week" ? 6 : 3) ? <span className="small">+{items.length - (mode === "week" ? 6 : 3)}</span> : null}
            </button>
          );
        })}
      </div>
      {isLoading ? <Spinner /> : null}
      <div className="section-head">
        <h2>{parseIsoDate(selected)?.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h2>
        <button className="btn btn-tint sm" onClick={() => nav(`/rounds/new?date=${selected}`)}>
          <Plus size={14} weight="bold" /> Add
        </button>
      </div>
      {selectedRounds.length === 0 ? (
        <p className="sub" style={{ margin: 0 }}>No interviews on this day.</p>
      ) : (
        <div className="list" style={{ paddingTop: 0 }}>
          {selectedRounds.map((r) => <RoundCard key={r.round_id} r={r} onClick={() => nav(`/rounds/${r.round_id}`)} />)}
        </div>
      )}
    </div>
  );
}
