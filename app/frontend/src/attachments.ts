import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { API_URL, getToken } from "./api";
import { uploadForm, LocalFile } from "./utils/upload";

export type PickKind = "gallery" | "camera" | "doc";
export type PickResult = { files: LocalFile[]; error?: string };

// Opens the gallery (photos + videos, multi-select), camera, or document picker.
export async function pickFiles(kind: PickKind): Promise<PickResult> {
  if (kind === "gallery") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { files: [], error: "Allow photo access in Settings to attach images or videos." };
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (r.canceled) return { files: [] };
    return {
      files: r.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? (a.type === "video" ? `video_${i}.mp4` : `image_${i}.jpg`),
        mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
      })),
    };
  }
  if (kind === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { files: [], error: "Allow camera access in Settings to take photos." };
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
    if (r.canceled) return { files: [] };
    const a = r.assets[0];
    return {
      files: [{
        uri: a.uri,
        name: a.fileName ?? (a.type === "video" ? "video.mp4" : "photo.jpg"),
        mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
      }],
    };
  }
  const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
  if (r.canceled) return { files: [] };
  return { files: r.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType })) };
}

export async function uploadAttachment(roundId: string, file: LocalFile): Promise<void> {
  const tok = await getToken();
  const res = await uploadForm(`${API_URL}/attachments/upload`, {
    headers: { Authorization: `Bearer ${tok}` },
    fields: { round_id: roundId },
    files: { file },
  });
  if (!res.ok) throw new Error(res.status === 402 ? "Storage credits exhausted" : `Upload failed (HTTP ${res.status})`);
}
