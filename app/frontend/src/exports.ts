import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_URL, getToken } from "./api";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_MIME = "application/pdf";

// Downloads an export from the backend and opens the share sheet (save to Files, Drive, Google Sheets, email...).
export async function downloadAndShare(path: string, fileName: string, mimeType: string): Promise<void> {
  const token = await getToken();

  if (Platform.OS === "web") {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
    return;
  }

  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_URL}${path}${sep}token=${encodeURIComponent(token ?? "")}`;
  const dest = new File(Paths.cache, fileName);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function safeName(s: string): string {
  return String(s || "export").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "export";
}
