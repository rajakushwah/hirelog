export function todayLocal(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseIsoDate(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(yyyyMm: string): string {
  return MONTHS[Number(yyyyMm.slice(5, 7)) - 1] ?? yyyyMm;
}

export function formatDate(s?: string | null): string {
  const d = parseIsoDate(s);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function daysBetween(from?: string | null, to?: string | null): number | null {
  const a = parseIsoDate(from);
  const b = to ? parseIsoDate(to) : new Date();
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/** "10:30", "10:30 AM", "2 PM" -> [hours, minutes] in 24h, or null. */
export function parseTime(t?: string | null): [number, number] | null {
  const m = (t ?? "").trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "PM" && h < 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  return h < 24 && min < 60 ? [h, min] : null;
}

export function roundStart(date?: string | null, time?: string | null): Date | null {
  const d = parseIsoDate(date);
  const t = parseTime(time);
  if (!d || !t) return null;
  d.setHours(t[0], t[1], 0, 0);
  return d;
}

export function parseMinutes(d?: string | null): number {
  const s = (d ?? "").toLowerCase();
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = s.match(/(\d+)\s*m/);
  let total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  if (!total && /^\d+$/.test(s.trim())) total = Number(s.trim());
  return total > 0 && total <= 1440 ? total : 60;
}

export function safeName(s: string): string {
  return (
    String(s || "export")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "export"
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Only http(s) URLs are ever put into an href. The backend enforces this too. */
export function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function googleCalendarUrl(r: {
  company_name: string;
  job_role: string;
  round_number: number;
  round_name: string;
  interview_date?: string | null;
  interview_time: string;
  duration: string;
  interview_type: string;
  meeting_link: string;
}): string | null {
  const start = roundStart(r.interview_date, r.interview_time);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  let dates: string;
  if (start) {
    const end = new Date(start.getTime() + parseMinutes(r.duration) * 60_000);
    dates = `${fmt(start)}/${fmt(end)}`;
  } else {
    const d = parseIsoDate(r.interview_date);
    if (!d) return null;
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    dates = `${toIsoDate(d).replace(/-/g, "")}/${toIsoDate(next).replace(/-/g, "")}`;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${r.company_name}: R${r.round_number} ${r.round_name}`,
    dates,
    details: [`${r.company_name} - ${r.job_role}`, `Type: ${r.interview_type}`, r.meeting_link && `Link: ${r.meeting_link}`]
      .filter(Boolean)
      .join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
