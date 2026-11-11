import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Round } from "./types";
import { roundStart, todayLocal } from "./util";

const ENABLED_KEY = "reminders_enabled_v1";
const SENT_KEY = "reminders_sent_v1";
const HOUR = 3_600_000;
// Fire when we're inside [lead - window, lead] of the interview start.
const LEADS = [
  { ms: 24 * HOUR, label: "tomorrow", window: 6 * HOUR },
  { ms: HOUR, label: "in 1 hour", window: 45 * 60_000 },
];

export function remindersSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function useReminderSetting(): [boolean, (on: boolean) => Promise<string | null>] {
  const [on, setOn] = useState(() => localStorage.getItem(ENABLED_KEY) === "1" && remindersSupported() && Notification.permission === "granted");
  const set = async (next: boolean): Promise<string | null> => {
    if (!next) {
      localStorage.removeItem(ENABLED_KEY);
      setOn(false);
      return null;
    }
    if (!remindersSupported()) return "This browser doesn't support notifications.";
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return "Notifications are blocked. Allow them for this site in your browser settings.";
    localStorage.setItem(ENABLED_KEY, "1");
    setOn(true);
    window.dispatchEvent(new Event("reminders:changed"));
    return null;
  };
  return [on, set];
}

function readSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || "{}");
  } catch {
    return {};
  }
}

/** While the app is open, shows a browser notification 1 day and 1 hour before each scheduled interview. */
export function useInterviewReminders() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) === "1");
  useEffect(() => {
    const sync = () => setEnabled(localStorage.getItem(ENABLED_KEY) === "1");
    window.addEventListener("reminders:changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("reminders:changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const { data } = useQuery({
    queryKey: ["rounds", "reminders"],
    queryFn: () => api<Round[]>(`/rounds?upcoming=true&today=${todayLocal()}`),
    enabled: enabled && remindersSupported(),
    refetchInterval: 15 * 60_000,
  });

  useEffect(() => {
    if (!enabled || !data || !remindersSupported() || Notification.permission !== "granted") return;
    const check = () => {
      const now = Date.now();
      const sent = readSent();
      for (const r of data) {
        const start = roundStart(r.interview_date, r.interview_time);
        if (!start) continue;
        for (const lead of LEADS) {
          const key = `${r.round_id}:${lead.ms}:${start.getTime()}`;
          const until = start.getTime() - now;
          if (!sent[key] && until <= lead.ms && until > lead.ms - lead.window) {
            new Notification(`${r.company_name} interview ${lead.label}`, {
              body: `R${r.round_number} · ${r.round_name} at ${r.interview_time}`,
              tag: key,
              icon: "/icon.png",
            });
            sent[key] = now;
          }
        }
      }
      for (const [k, t] of Object.entries(sent)) if (now - t > 3 * 24 * HOUR) delete sent[k];
      localStorage.setItem(SENT_KEY, JSON.stringify(sent));
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, data]);
}
