import { useDeferredValue, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AndroidLogo,
  ArrowLeft,
  CaretLeft,
  CaretRight,
  CheckCircle,
  ChartLine,
  Envelope,
  EnvelopeOpen,
  HardDrives,
  ListChecks,
  MagnifyingGlass,
  Prohibit,
  ShieldCheck,
  SignOut,
  Trash,
  Trophy,
  XCircle,
  UserCirclePlus,
  Users,
} from "@phosphor-icons/react";
import { api } from "../api";
import { ChipRow, ConfirmSheet, EmptyState, ErrorNote, Field, KV, Spinner } from "../components/ui";
import { useBack } from "../nav";
import { useTheme } from "../theme";
import type { AdminAccessRequest, AdminAuditEntry, AdminBadges, AdminMessage, AdminOverview, AdminUserDetail, AdminUserPage } from "../types";
import { formatBytes } from "../util";

const PAGE = 25;

function dateTime(s?: string | null): string {
  if (!s) return "Never";
  return new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ago(s?: string | null): string {
  if (!s) return "Never";
  const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} d ago`;
  return new Date(s).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useBadges() {
  return useQuery({ queryKey: ["admin", "badges"], queryFn: () => api<AdminBadges>("/admin/badges"), staleTime: 30_000 });
}

function AdminNav() {
  const { data: b } = useBadges();
  const tabs = [
    { to: "/admin", label: "Overview", end: true },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/app-access", label: b?.pending_access ? `App access (${b.pending_access})` : "App access" },
    { to: "/admin/messages", label: b?.unread_messages ? `Messages (${b.unread_messages})` : "Messages" },
    { to: "/admin/audit", label: "Audit log" },
  ];
  return (
    <nav className="chips" aria-label="Admin sections">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `chip admin-tab${isActive ? " selected" : ""}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function AdminHead({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1 className="page-title">{title}</h1>
          <span className="sub">{sub}</span>
        </div>
        <span className="badge admin-badge"><ShieldCheck size={16} weight="fill" /> Admin</span>
      </div>
      <AdminNav />
    </>
  );
}

function Metric({ icon, label, value, hint, onClick }: { icon: ReactNode; label: string; value: ReactNode; hint?: string; onClick?: () => void }) {
  const body = (
    <>
      {icon}
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint ? <span className="small">{hint}</span> : null}
    </>
  );
  return onClick ? <button className="stat" onClick={onClick}>{body}</button> : <div className="stat">{body}</div>;
}

function useChartStyle() {
  const { colors } = useTheme();
  return {
    colors,
    palette: [colors.brandPrimary, colors.brandSecondary, colors.success, colors.warning, colors.error, colors.info],
    tooltip: {
      contentStyle: { background: colors.surfaceSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, color: colors.onSurface },
      cursor: { fill: colors.surfaceTertiary },
    },
    axis: { stroke: colors.border, tick: { fill: colors.muted, fontSize: 11 }, tickLine: false },
    grid: { stroke: colors.border, strokeDasharray: "3 3", vertical: false },
  };
}

function ChartCard({ title, children, height = 220 }: { title: string; children: ReactNode; height?: number }) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <div style={{ height, marginTop: 12 }}>
        <ResponsiveContainer>{children as never}</ResponsiveContainer>
      </div>
    </div>
  );
}

const RANGES = ["7 days", "30 days", "90 days", "1 year"] as const;
const RANGE_DAYS: Record<(typeof RANGES)[number], number> = { "7 days": 7, "30 days": 30, "90 days": 90, "1 year": 365 };

export function AdminOverviewPage() {
  const nav = useNavigate();
  const [range, setRange] = useState<(typeof RANGES)[number]>("30 days");
  const days = RANGE_DAYS[range];
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "overview", days],
    queryFn: () => api<AdminOverview>(`/admin/overview?days=${days}`),
    placeholderData: keepPreviousData,
  });
  const { colors, palette, tooltip, axis, grid } = useChartStyle();

  let running = (data?.users_total ?? 0) - (data?.users_new ?? 0);
  const series = (data?.series ?? []).map((d) => {
    running += d.signups;
    return { ...d, label: dayLabel(d.date), total: running };
  });
  const pie = (data?.status_distribution ?? []).slice(0, 6).map((s, i) => ({ ...s, color: palette[i % 6] }));
  const stickiness = data && data.mau ? Math.round((data.dau / data.mau) * 100) : 0;

  return (
    <div className="page admin-page">
      <AdminHead title="Admin overview" sub="How HireLog is being used" />
      <ChipRow options={RANGES} value={range} onChange={setRange} label="Time range" />

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <>
          <h2 className="section-title">Users</h2>
          <div className="stat-grid">
            <Metric icon={<Users size={22} weight="fill" color={colors.brandPrimary} />} label="Total users" value={data!.users_total} hint={`+${data!.users_new} in the last ${range}`} />
            <Metric icon={<ChartLine size={22} weight="fill" color={colors.success} />} label="Active today" value={data!.dau} hint={`${stickiness}% of monthly actives`} />
            <Metric icon={<ChartLine size={22} weight="fill" color={colors.info} />} label="Active this week" value={data!.wau} />
            <Metric icon={<ChartLine size={22} weight="fill" color={colors.brandSecondary} />} label="Active this month" value={data!.mau} hint={`${data!.admins} admin · ${data!.disabled} disabled`} />
          </div>

          <h2 className="section-title">Usage</h2>
          <div className="stat-grid">
            <Metric icon={<ListChecks size={22} weight="fill" color={colors.brandPrimary} />} label="Applications" value={data!.applications} hint={`${data!.rounds} interview rounds · ${data!.questions} questions`} />
            <Metric icon={<Trophy size={22} weight="fill" color={colors.success} />} label="Offers" value={data!.offers} hint={`${data!.rejections} rejections`} />
            <Metric icon={<HardDrives size={22} weight="fill" color={colors.warning} />} label="Attachment storage" value={formatBytes(data!.storage_bytes)} hint={`${data!.attachments} files`} />
            <Metric icon={<AndroidLogo size={22} weight="fill" color={colors.info} />} label="App downloads" value={data!.downloads_total} hint={`by ${data!.downloaders} user${data!.downloaders === 1 ? "" : "s"} · ${data!.downloads_window} in the last ${range}`} onClick={() => nav("/admin/users?filter=downloaded")} />
          </div>

          <div className="charts">
            <ChartCard title="User growth">
              <ComposedChart data={series} margin={{ left: -20, right: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltip} />
                <Area type="monotone" dataKey="total" name="Total users" stroke={colors.brandPrimary} fill={colors.brandPrimary} fillOpacity={0.15} strokeWidth={2} />
                <Bar dataKey="signups" name="New sign-ups" fill={colors.brandSecondary} />
              </ComposedChart>
            </ChartCard>

            <ChartCard title="Active users per day">
              <BarChart data={series} margin={{ left: -20, right: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltip} />
                <Bar dataKey="active" name="Active users" fill={colors.success} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="signups" name="New sign-ups" fill={colors.brandPrimary} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Activity over time" height={240}>
              <BarChart data={series} margin={{ left: -20, right: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltip} />
                <Legend wrapperStyle={{ fontSize: 12, color: colors.muted }} />
                <Bar dataKey="applications" name="Applications" stackId="u" fill={colors.brandPrimary} maxBarSize={24} />
                <Bar dataKey="rounds" name="Rounds" stackId="u" fill={colors.brandSecondary} maxBarSize={24} />
                <Bar dataKey="questions" name="Questions" stackId="u" fill={colors.info} maxBarSize={24} />
                <Bar dataKey="attachments" name="Files" stackId="u" fill={colors.warning} maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Android APK downloads">
              <BarChart data={series} margin={{ left: -20, right: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltip} />
                <Bar dataKey="downloads" name="Downloads" fill={colors.info} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ChartCard>

            {pie.length > 0 ? (
              <div className="card">
                <h2 className="card-title">Application outcomes (all users)</h2>
                <div style={{ height: 200, marginTop: 12 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={1} stroke={colors.surfaceSecondary}>
                        {pie.map((d) => <Cell key={d.label} fill={d.color} />)}
                      </Pie>
                      <Tooltip {...tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="legend">
                  {pie.map((s) => (
                    <span key={s.label} className="row small" style={{ color: "var(--on-surface)" }}>
                      <span className="legend-dot" style={{ background: s.color }} />
                      {s.label} · {s.count}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {data!.interview_results.length > 0 ? (
              <ChartCard title="Interview results (all users)" height={Math.max(140, data!.interview_results.length * 40)}>
                <BarChart data={data!.interview_results} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} {...axis} />
                  <YAxis type="category" dataKey="label" width={100} {...axis} />
                  <Tooltip {...tooltip} />
                  <Bar dataKey="count" name="Rounds" fill={colors.brandSecondary} radius={[0, 6, 6, 0]} maxBarSize={24} />
                </BarChart>
              </ChartCard>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

const USER_FILTERS = ["All", "Active (30 days)", "Inactive", "Downloaded app", "Disabled", "Admins"] as const;
const FILTER_PARAM: Record<(typeof USER_FILTERS)[number], string> = {
  All: "all",
  "Active (30 days)": "active",
  Inactive: "inactive",
  "Downloaded app": "downloaded",
  Disabled: "disabled",
  Admins: "admins",
};

export function AdminUsersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [params] = useSearchParams();
  const initial = USER_FILTERS.find((f) => FILTER_PARAM[f] === params.get("filter")) ?? "All";
  const [filter, setFilter] = useState<(typeof USER_FILTERS)[number]>(initial);
  const [sort, setSort] = useState(initial === "Downloaded app" ? "download_desc" : "created_desc");
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", query, filter, sort, page],
    queryFn: () =>
      api<AdminUserPage>(
        `/admin/users?${new URLSearchParams({ q: query, filter: FILTER_PARAM[filter], sort, limit: String(PAGE), offset: String(page * PAGE) })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <div className="page admin-page">
      <AdminHead title="Users" sub={data ? `${data.total} account${data.total === 1 ? "" : "s"}` : "All accounts"} />
      <div className="row">
        <label className="search grow" style={{ flexDirection: "row" }}>
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search users</span>
          <input placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} maxLength={200} />
        </label>
        <select className="select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Sort">
          <option value="created_desc">Newest</option>
          <option value="created_asc">Oldest</option>
          <option value="active_desc">Recently active</option>
          <option value="download_desc">Recently downloaded app</option>
          <option value="name">Name</option>
        </select>
      </div>
      <ChipRow options={USER_FILTERS} value={filter} onChange={(f) => { setFilter(f); setPage(0); }} label="Filter users" />

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data!.items.length === 0 ? (
        <EmptyState title="No users found" subtitle="Try a different search or filter." icon={<Users size={28} />} />
      ) : (
        <>
          <div className="list">
            {data!.items.map((u) => (
              <button key={u.user_id} className="list-card" onClick={() => nav(`/admin/users/${u.user_id}`)}>
                <span className="avatar sm">{u.name?.[0]?.toUpperCase() ?? "U"}</span>
                <span className="grow">
                  <span className="company truncate">{u.name}</span>
                  <span className="role truncate">{u.email}</span>
                  <span className="meta">
                    Joined {new Date(u.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })} · {u.last_active_at ? `Active ${ago(u.last_active_at)}` : "Not active yet"}
                  </span>
                  <span className="meta">
                    {u.applications} apps · {u.rounds} rounds · {u.questions} questions · {formatBytes(u.storage_bytes)}
                  </span>
                  {u.apk_downloads ? (
                    <span className="meta">
                      <AndroidLogo size={13} weight="fill" /> Downloaded app {u.apk_downloads}× · last {ago(u.last_download_at)}
                    </span>
                  ) : null}
                </span>
                <UserBadges admin={u.is_admin} disabled={!!u.disabled_at} />
              </button>
            ))}
          </div>
          {pages > 1 ? (
            <div className="row admin-pager">
              <button className="icon-btn" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><CaretLeft size={20} /></button>
              <span className="small">Page {page + 1} of {pages}</span>
              <button className="icon-btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><CaretRight size={20} /></button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function UserBadges({ admin, disabled }: { admin: boolean; disabled: boolean }) {
  if (!admin && !disabled) return null;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {admin ? <span className="badge admin-badge">Admin</span> : null}
      {disabled ? <span className="badge admin-badge danger">Disabled</span> : null}
    </span>
  );
}

const ACCESS_LABEL: Record<AdminUserDetail["app_access"], string> = {
  none: "Not requested",
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
};

function useAccessDecision() {
  const qc = useQueryClient();
  const { id = "" } = useParams();
  return useMutation({
    mutationFn: (d: "approve" | "reject" | { userId: string; decision: "approve" | "reject" }) => {
      const [userId, decision] = typeof d === "string" ? [id, d] : [d.userId, d.decision];
      return api(`/admin/app-access/${encodeURIComponent(userId)}/${decision}`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}

const ACCESS_FILTERS = ["Pending", "Approved", "Rejected", "All"] as const;

export function AdminAccessPage() {
  const [filter, setFilter] = useState<(typeof ACCESS_FILTERS)[number]>("Pending");
  const nav = useNavigate();
  const decide = useAccessDecision();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "app-access", filter],
    queryFn: () => api<AdminAccessRequest[]>(`/admin/app-access?filter=${filter.toLowerCase()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page admin-page">
      <AdminHead title="App access" sub="Approve who can download the Android beta" />
      <ChipRow options={ACCESS_FILTERS} value={filter} onChange={setFilter} label="Filter requests" />
      <ErrorNote error={decide.error} />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data!.length === 0 ? (
        <EmptyState
          title={filter === "Pending" ? "No pending requests" : "Nothing here yet"}
          subtitle="Members request access from the Get the app page. New requests show up here."
          icon={<AndroidLogo size={28} />}
        />
      ) : (
        <div className="list">
          {data!.map((r) => (
            <div key={r.user_id} className="card admin-msg">
              <div className="row">
                <button className="grow admin-link" style={{ minWidth: 0 }} onClick={() => nav(`/admin/users/${r.user_id}`)}>
                  <span className="company truncate">{r.name}</span>
                  <span className="role truncate">{r.email}</span>
                </button>
                <span className={`badge admin-badge${r.status === "rejected" ? " danger" : ""}`}>{ACCESS_LABEL[r.status]}</span>
              </div>
              {r.note ? <p className="admin-msg-body">&ldquo;{r.note}&rdquo;</p> : null}
              <div className="row">
                <span className="meta grow">
                  {r.requested_at ? `Requested ${ago(r.requested_at)}` : "Granted without a request"}
                  {r.decided_at ? ` · ${r.status === "approved" ? "approved" : "rejected"} ${ago(r.decided_at)} by ${r.decided_by}` : ""}
                </span>
                {r.status !== "approved" ? (
                  <button className="btn btn-primary sm" disabled={decide.isPending} onClick={() => decide.mutate({ userId: r.user_id, decision: "approve" })}>
                    <CheckCircle size={16} weight="bold" /> Approve
                  </button>
                ) : null}
                {r.status !== "rejected" ? (
                  <button className="btn btn-secondary sm" disabled={decide.isPending} onClick={() => decide.mutate({ userId: r.user_id, decision: "reject" })}>
                    <XCircle size={16} weight="bold" /> {r.status === "approved" ? "Revoke" : "Reject"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Action = "disable" | "enable" | "signout" | "grant" | "revoke" | "delete";

const ACTION_COPY: Record<Action, { title: string; message: string; label: string }> = {
  disable: { title: "Disable this account?", message: "They are signed out everywhere and can't sign in until you enable the account again. Their data is kept.", label: "Disable account" },
  enable: { title: "Enable this account?", message: "They will be able to sign in again.", label: "Enable account" },
  signout: { title: "Sign out of all devices?", message: "Every active session for this user ends now. They can sign back in straight away.", label: "Sign out everywhere" },
  grant: { title: "Make this user an admin?", message: "Admins can see every user's account details and usage, and can disable or delete accounts.", label: "Make admin" },
  revoke: { title: "Remove admin access?", message: "They keep their account but lose access to the admin portal.", label: "Remove admin" },
  delete: { title: "Delete this user and all their data?", message: "Applications, interview rounds, questions and attachments are deleted permanently. This can't be undone.", label: "Delete permanently" },
};

export function AdminUserPage() {
  const { id = "" } = useParams();
  const back = useBack("/admin/users");
  const nav = useNavigate();
  const qc = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const { data: u, isLoading, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),
  });

  const run = useMutation({
    mutationFn: async (a: Action) => {
      const base = `/admin/users/${encodeURIComponent(id)}`;
      if (a === "disable") return api(`${base}/disable`, { method: "POST" });
      if (a === "enable") return api(`${base}/enable`, { method: "POST" });
      if (a === "signout") return api(`${base}/signout`, { method: "POST" });
      if (a === "grant") return api(`${base}/admin`, { method: "POST" });
      if (a === "revoke") return api(`${base}/admin`, { method: "DELETE" });
      return api(base, { method: "DELETE", json: { confirm_email: confirmEmail } });
    },
    onSuccess: (_r, a) => {
      setAction(null);
      setConfirmEmail("");
      qc.invalidateQueries({ queryKey: ["admin"] });
      if (a === "delete") nav("/admin/users", { replace: true });
    },
  });

  const access = useAccessDecision();

  const open = (a: Action) => {
    run.reset();
    setConfirmEmail("");
    setAction(a);
  };

  if (isLoading) return <Spinner />;
  if (error || !u) return <div className="page admin-page"><ErrorNote error={error} /></div>;
  const disabled = !!u.disabled_at;

  return (
    <div className="page admin-page">
      <div className="page-head">
        <button className="icon-btn" onClick={back} aria-label="Back"><ArrowLeft size={22} /></button>
        <span className="spacer" />
      </div>
      <div className="row" style={{ gap: 16 }}>
        <span className="avatar">{u.name?.[0]?.toUpperCase() ?? "U"}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="page-title truncate">{u.name}</h1>
          <span className="sub truncate">{u.email}</span>
        </div>
        <UserBadges admin={u.is_admin} disabled={disabled} />
      </div>

      <div className="stat-grid">
        <Metric icon={<ListChecks size={22} weight="fill" />} label="Applications" value={u.applications} hint={`${u.offers} offers`} />
        <Metric icon={<ChartLine size={22} weight="fill" />} label="Interview rounds" value={u.rounds} hint={`${u.questions} questions`} />
        <Metric icon={<HardDrives size={22} weight="fill" />} label="Storage" value={formatBytes(u.storage_bytes)} hint={`${u.attachments} files`} />
        <Metric icon={<Users size={22} weight="fill" />} label="Active days (30 days)" value={u.active_days_30} hint={`${u.active_sessions} signed-in device${u.active_sessions === 1 ? "" : "s"}`} />
      </div>

      <div className="card">
        <h2 className="card-title">Account</h2>
        <KV label="Joined" value={dateTime(u.created_at)} />
        <KV label="Last sign-in" value={dateTime(u.last_login_at)} />
        <KV label="Last active" value={u.last_active_at ? `${ago(u.last_active_at)} (${dateTime(u.last_active_at)})` : "Never"} />
        <KV label="App access" value={ACCESS_LABEL[u.app_access]} />
        <KV label="Android app" value={u.apk_downloads ? `Downloaded ${u.apk_downloads}× · last ${dateTime(u.last_download_at)}` : "Not downloaded"} />
        <KV label="Sign-in methods" value={[u.has_password ? "Password" : "", u.google_linked ? "Google" : ""].filter(Boolean).join(", ") || "None"} />
        <KV label="Status" value={disabled ? `Disabled ${dateTime(u.disabled_at)}` : "Active"} />
        <KV label="User ID" value={u.user_id} />
      </div>

      <div className="card">
        <h2 className="card-title">Actions</h2>
        <p className="small" style={{ margin: "0 0 12px" }}>Every action is recorded in the audit log.</p>
        <ErrorNote error={access.error} />
        <div className="admin-actions">
          {disabled ? (
            <button className="btn btn-tint" onClick={() => open("enable")}><UserCirclePlus size={18} weight="bold" /> Enable account</button>
          ) : (
            <button className="btn btn-tint" onClick={() => open("disable")}><Prohibit size={18} weight="bold" /> Disable account</button>
          )}
          <button className="btn btn-tint" onClick={() => open("signout")}><SignOut size={18} weight="bold" /> Sign out everywhere</button>
          {u.is_admin ? (
            <button className="btn btn-tint" onClick={() => open("revoke")}><ShieldCheck size={18} weight="bold" /> Remove admin</button>
          ) : (
            <button className="btn btn-tint" onClick={() => open("grant")} disabled={disabled}><ShieldCheck size={18} weight="bold" /> Make admin</button>
          )}
          {u.app_access !== "approved" ? (
            <button className="btn btn-tint" onClick={() => access.mutate("approve")} disabled={access.isPending}><CheckCircle size={18} weight="bold" /> Approve app access</button>
          ) : !u.is_admin ? (
            <button className="btn btn-tint" onClick={() => access.mutate("reject")} disabled={access.isPending}><XCircle size={18} weight="bold" /> Revoke app access</button>
          ) : null}
          <button className="btn btn-danger" onClick={() => open("delete")}><Trash size={18} weight="bold" /> Delete user</button>
        </div>
      </div>

      <ConfirmSheet
        open={action !== null}
        title={action ? ACTION_COPY[action].title : ""}
        message={action ? ACTION_COPY[action].message : ""}
        confirmLabel={action ? ACTION_COPY[action].label : ""}
        busy={run.isPending}
        confirmDisabled={action === "delete" && confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()}
        onConfirm={() => action && run.mutate(action)}
        onCancel={() => setAction(null)}
      >
        {action === "delete" ? (
          <Field label={`Type ${u.email} to confirm`} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />
        ) : null}
        <ErrorNote error={run.error} />
      </ConfirmSheet>
    </div>
  );
}

const MSG_FILTERS = ["Unread", "All"] as const;

export function AdminMessagesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof MSG_FILTERS)[number]>("Unread");
  const [toDelete, setToDelete] = useState<AdminMessage | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "messages", filter],
    queryFn: () => api<AdminMessage[]>(`/admin/messages?filter=${filter === "Unread" ? "unread" : "all"}`),
    placeholderData: keepPreviousData,
  });
  const done = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const mark = useMutation({
    mutationFn: (m: AdminMessage) => api(`/admin/messages/${encodeURIComponent(m.message_id)}/read`, { json: { read: !m.read_at } }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (m: AdminMessage) => api(`/admin/messages/${encodeURIComponent(m.message_id)}`, { method: "DELETE" }),
    onSuccess: () => {
      setToDelete(null);
      done();
    },
  });

  return (
    <div className="page admin-page">
      <AdminHead title="Messages" sub="Sent from the Contact form on the home page" />
      <ChipRow options={MSG_FILTERS} value={filter} onChange={setFilter} label="Filter messages" />
      <ErrorNote error={mark.error} />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data!.length === 0 ? (
        <EmptyState title={filter === "Unread" ? "Inbox zero" : "No messages yet"} subtitle="New contact form messages will show up here." icon={<Envelope size={28} />} />
      ) : (
        <div className="list">
          {data!.map((m) => (
            <div key={m.message_id} className={`card admin-msg${m.read_at ? "" : " unread"}`}>
              <div className="row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <span className="company truncate">{m.name}</span>
                  <a className="role truncate" href={`mailto:${m.email}`}>{m.email}</a>
                </div>
                <span className="tag">{m.topic}</span>
              </div>
              <p className="admin-msg-body">{m.message}</p>
              <div className="row">
                <span className="meta grow">{dateTime(m.created_at)}</span>
                <button className="icon-btn" onClick={() => mark.mutate(m)} aria-label={m.read_at ? "Mark as unread" : "Mark as read"} title={m.read_at ? "Mark as unread" : "Mark as read"}>
                  {m.read_at ? <Envelope size={20} /> : <EnvelopeOpen size={20} />}
                </button>
                <button className="icon-btn" onClick={() => { remove.reset(); setToDelete(m); }} aria-label="Delete message" title="Delete message">
                  <Trash size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmSheet
        open={toDelete !== null}
        title="Delete this message?"
        message="It's removed permanently."
        busy={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      >
        <ErrorNote error={remove.error} />
      </ConfirmSheet>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  disable_user: "Disabled account",
  enable_user: "Enabled account",
  sign_out_user: "Signed out all devices",
  grant_admin: "Made admin",
  revoke_admin: "Removed admin",
  delete_user: "Deleted user",
  delete_message: "Deleted message",
  approve_app_access: "Approved app access",
  reject_app_access: "Rejected app access",
  revoke_app_access: "Revoked app access",
};

export function AdminAuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => api<AdminAuditEntry[]>("/admin/audit"),
  });
  return (
    <div className="page admin-page">
      <AdminHead title="Audit log" sub="Every admin action, newest first. Entries can't be edited or deleted." />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : data!.length === 0 ? (
        <EmptyState title="No admin actions yet" subtitle="Actions like disabling or deleting a user are recorded here." icon={<ListChecks size={28} />} />
      ) : (
        <div className="card">
          {data!.map((e) => (
            <div key={e.entry_id} className="kv-row multi">
              <span className="kv-label">{dateTime(e.created_at)}</span>
              <span className="kv-val">
                <strong>{ACTION_LABELS[e.action] ?? e.action}</strong> · {e.target_email || "—"}
                <span className="small" style={{ display: "block" }}>
                  by {e.admin_email}{e.detail ? ` · ${e.detail}` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
