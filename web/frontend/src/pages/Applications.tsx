import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Buildings, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { api } from "../api";
import { APPLICATION_STATUSES } from "../constants";
import { ChipRow, EmptyState, ErrorNote, Spinner, StatusBadge } from "../components/ui";
import type { Application } from "../types";
import { formatDate } from "../util";

const FILTERS = ["All", ...APPLICATION_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

export function Applications() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const initial = params.get("status");
  const [filter, setFilter] = useState<Filter>(FILTERS.includes(initial as Filter) ? (initial as Filter) : "All");
  const [sort, setSort] = useState<"applied_desc" | "applied_asc" | "updated_desc">("applied_desc");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());

  const { data, isLoading, error } = useQuery({
    queryKey: ["apps", filter, query, sort],
    queryFn: () =>
      api<Application[]>(`/applications?${new URLSearchParams({ status: filter, q: query, sort }).toString()}`),
    placeholderData: keepPreviousData,
  });

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setParams(f === "All" ? {} : { status: f }, { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title grow">Applications</h1>
        <button className="btn btn-primary sm" onClick={() => nav("/applications/new")}>
          <Plus size={16} weight="bold" /> New
        </button>
      </div>
      <div className="row">
        <label className="search grow" style={{ flexDirection: "row" }}>
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search applications</span>
          <input placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
        </label>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="applied_desc">Newest applied</option>
          <option value="applied_asc">Oldest applied</option>
          <option value="updated_desc">Recently updated</option>
        </select>
      </div>
      <ChipRow options={FILTERS} value={filter} onChange={changeFilter} label="Filter by status" />

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (data?.length ?? 0) === 0 ? (
        query || filter !== "All" ? (
          <EmptyState title="No matches" subtitle="Try a different search or status filter." icon={<MagnifyingGlass size={28} />} />
        ) : (
          <EmptyState
            title="No applications yet"
            subtitle="Log your first application to start tracking offers, rejections and interview rounds."
            actionLabel="Add application"
            onAction={() => nav("/applications/new")}
          />
        )
      ) : (
        <div className="list">
          {data!.map((a) => (
            <button key={a.application_id} className="list-card" onClick={() => nav(`/applications/${a.application_id}`)}>
              <span className="icon-box"><Buildings size={22} weight="fill" /></span>
              <span className="grow">
                <span className="company truncate">{a.company_name}</span>
                <span className="role truncate">{a.job_role}</span>
                <span className="meta">{formatDate(a.applied_date)}  ·  {a.job_location || "—"}</span>
              </span>
              <StatusBadge status={a.application_status} kind="application" />
            </button>
          ))}
        </div>
      )}

      <button className="fab" onClick={() => nav("/applications/new")} aria-label="New application">
        <Plus size={24} weight="bold" />
      </button>
    </div>
  );
}
