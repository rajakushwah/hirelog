import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Briefcase,
  Buildings,
  CalendarCheck,
  CalendarPlus,
  Clock,
  ListChecks,
  MagnifyingGlass,
  Plus,
  Trophy,
  VideoCamera,
  XCircle,
} from "@phosphor-icons/react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, Spinner, StatusBadge } from "../components/ui";
import { useTheme } from "../theme";
import type { DashboardStats } from "../types";
import { formatDate, monthLabel, todayLocal } from "../util";

export function Dashboard() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardStats>(`/dashboard/stats?today=${todayLocal()}`),
  });

  const palette = [colors.brandPrimary, colors.brandSecondary, colors.success, colors.warning, colors.error, colors.info];
  const pieData = (data?.status_distribution ?? []).slice(0, 6).map((s, i) => ({ name: s.status, value: s.count, color: palette[i % 6] }));
  const barData = (data?.applications_by_month ?? []).map((m) => ({ label: monthLabel(m.month), value: m.count }));
  const tooltip = {
    contentStyle: { background: colors.surfaceSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, color: colors.onSurface },
    cursor: { fill: colors.surfaceTertiary },
  };
  const axis = { stroke: colors.border, tick: { fill: colors.muted, fontSize: 11 }, tickLine: false };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="page-title">Hi, {user?.name?.split(" ")[0] ?? "there"}</h1>
          <span className="sub">Here is your job-search at a glance</span>
        </div>
        <button className="icon-btn" onClick={() => nav("/search")} aria-label="Search">
          <MagnifyingGlass size={22} />
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <>
          <div className="stat-grid">
            <Stat icon={<Buildings size={22} weight="fill" color={colors.brandPrimary} />} label="Companies" value={data!.total_companies} onClick={() => nav("/applications")} />
            <Stat icon={<Briefcase size={22} weight="fill" color={colors.brandSecondary} />} label="Applications" value={data!.total_applications} onClick={() => nav("/applications")} />
            <Stat icon={<CalendarCheck size={22} weight="fill" color={colors.info} />} label="Upcoming" value={data!.interviews_upcoming} onClick={() => nav("/interviews")} />
            <Stat icon={<VideoCamera size={22} weight="fill" color={colors.brandPrimary} />} label="Scheduled" value={data!.total_interviews_scheduled} onClick={() => nav("/interviews")} />
            <Stat icon={<CalendarCheck size={22} weight="fill" color={colors.brandSecondary} />} label="Completed" value={data!.interviews_completed} onClick={() => nav("/interviews?filter=Completed")} />
            <Stat icon={<Clock size={22} weight="fill" color={colors.warning} />} label="In Progress" value={data!.in_progress} onClick={() => nav("/applications")} />
            <Stat icon={<Trophy size={22} weight="fill" color={colors.success} />} label="Offers" value={data!.offers} onClick={() => nav("/applications?status=Offer Received")} />
            <Stat icon={<XCircle size={22} weight="fill" color={colors.error} />} label="Rejections" value={data!.rejections} onClick={() => nav("/applications?status=Rejected")} />
          </div>

          <div className="quick-row">
            <button className="btn btn-primary" onClick={() => nav("/applications/new")}>
              <Plus size={18} weight="bold" /> New application
            </button>
            <button className="btn btn-tint" onClick={() => nav("/rounds/new")}>
              <CalendarPlus size={18} weight="bold" /> Schedule interview
            </button>
            <button className="btn btn-tint" onClick={() => nav("/applications")}>
              <ListChecks size={18} weight="bold" /> View applications
            </button>
            <button className="btn btn-tint" onClick={() => nav("/interviews")}>
              <CalendarCheck size={18} weight="bold" /> View interviews
            </button>
          </div>

          <div className="charts">
            {pieData.length > 0 ? (
              <div className="card">
                <h2 className="card-title">Status distribution</h2>
                <div style={{ height: 200, marginTop: 12 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={1} stroke={colors.surfaceSecondary}>
                        {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip {...tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="legend">
                  {pieData.map((s) => (
                    <span key={s.name} className="row small" style={{ color: "var(--on-surface)" }}>
                      <span className="legend-dot" style={{ background: s.color }} />
                      {s.name} · {s.value}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {barData.length > 0 ? (
              <div className="card">
                <h2 className="card-title">Applications by month</h2>
                <div style={{ height: 220, marginTop: 12 }}>
                  <ResponsiveContainer>
                    <BarChart data={barData} margin={{ left: -20, right: 8 }}>
                      <XAxis dataKey="label" {...axis} />
                      <YAxis allowDecimals={false} {...axis} />
                      <Tooltip {...tooltip} />
                      <Bar dataKey="value" name="Applications" fill={colors.brandPrimary} radius={[6, 6, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            {data!.rounds_by_company.length > 0 ? (
              <div className="card">
                <h2 className="card-title">Interview rounds by company</h2>
                <div style={{ height: Math.max(140, data!.rounds_by_company.length * 40), marginTop: 12 }}>
                  <ResponsiveContainer>
                    <BarChart data={data!.rounds_by_company} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" allowDecimals={false} {...axis} />
                      <YAxis type="category" dataKey="company" width={110} {...axis} />
                      <Tooltip {...tooltip} />
                      <Bar dataKey="count" name="Rounds" fill={colors.brandSecondary} radius={[0, 6, 6, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            <div className="card">
              <h2 className="card-title">Upcoming interviews</h2>
              {data!.upcoming_rounds.length === 0 ? (
                <p className="sub">No interviews scheduled. Add a round to an application to see it here.</p>
              ) : (
                <div className="list">
                  {data!.upcoming_rounds.map((r) => (
                    <button key={r.round_id} className="list-card" style={{ padding: 12 }} onClick={() => nav(`/rounds/${r.round_id}`)}>
                      <span className="icon-box"><VideoCamera size={22} weight="fill" /></span>
                      <span className="grow">
                        <span className="company truncate">{r.company_name}</span>
                        <span className="role truncate">R{r.round_number} · {r.round_name}</span>
                        <span className="meta">{formatDate(r.interview_date)}{r.interview_time ? ` · ${r.interview_time}` : ""}</span>
                      </span>
                      <StatusBadge status={r.interview_status} kind="interview" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: number; onClick: () => void }) {
  return (
    <button className="stat" onClick={onClick}>
      {icon}
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </button>
  );
}
