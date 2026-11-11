export class ApiError extends Error {
  status: number;
  detail: string;
  fields: Record<string, string>;

  constructor(status: number, detail: string, fields: Record<string, string> = {}) {
    super(friendlyMessage(status, detail, fields));
    this.status = status;
    this.detail = detail;
    this.fields = fields;
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  registration_failed: "An account with this email may already exist. Try signing in.",
  registration_disabled: "New sign-ups are turned off on this server.",
  too_many_requests: "Too many attempts. Please wait a few minutes and try again.",
  csrf_failed: "Your session expired. Reload the page and try again.",
  bad_origin: "Request blocked for security reasons. Reload the page and try again.",
  file_too_large: "That file is too large.",
  payload_too_large: "That file is too large.",
  unsupported_file_type: "This file type isn't supported. Use images, videos, PDFs, Office documents or text files.",
  invalid_image: "This image couldn't be read.",
  empty_file: "That file is empty.",
  too_many_attachments: "This round already has the maximum number of attachments.",
  not_found: "Not found. It may have been deleted.",
  application_not_found: "That application no longer exists.",
  round_not_found: "That interview round no longer exists.",
  internal_error: "Something went wrong on the server. Please try again.",
};

function friendlyMessage(status: number, detail: string, fields: Record<string, string>): string {
  if (detail === "validation_error") {
    const first = Object.entries(fields)[0];
    return first ? `${humanize(first[0])}: ${first[1]}` : "Please check the form and try again.";
  }
  if (MESSAGES[detail]) return MESSAGES[detail];
  if (status === 0) return "Can't reach the server. Check that it's running and try again.";
  return `Request failed (${status}).`;
}

function humanize(field: string): string {
  const s = field.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function readCookie(name: string): string {
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function csrfToken(): string {
  return readCookie("__Host-hl_csrf") || readCookie("hl_csrf");
}

export const AUTH_EXPIRED_EVENT = "auth:expired";

type Opts = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const method = (opts.method ?? (opts.json !== undefined || opts.form ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken();
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body, credentials: "same-origin", signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network_error");
  }

  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/register")) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  if (!res.ok) {
    let detail = "";
    const fields: Record<string, string> = {};
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : "";
      for (const err of data.errors ?? []) {
        const loc = (err.loc ?? []).filter((x: unknown) => x !== "body" && x !== "query");
        if (loc.length) fields[String(loc[0])] = String(err.msg ?? "invalid").replace(/^Value error, /, "");
      }
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, detail || `http_${res.status}`, fields);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fileUrl = (attachmentId: string, download = false) =>
  `/api/attachments/${encodeURIComponent(attachmentId)}/file${download ? "?download=true" : ""}`;

/** Fetches a binary export with the session cookie and saves it via a temporary object URL. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail || `http_${res.status}`);
  }
  saveBlob(await res.blob(), fileName);
}

export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}
