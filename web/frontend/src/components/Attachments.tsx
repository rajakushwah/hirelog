import { useEffect, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, DownloadSimple, FileText, Images, VideoCamera, X } from "@phosphor-icons/react";
import { api, fileUrl } from "../api";
import { ATTACHMENT_ACCEPT } from "../constants";
import type { Attachment } from "../types";
import { formatBytes } from "../util";
import { ConfirmSheet, ErrorNote, Spinner } from "./ui";

export async function uploadAttachment(roundId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("round_id", roundId);
  form.append("file", file, file.name);
  return api<Attachment>("/attachments", { form });
}

/** Three pickers matching the mobile app: gallery (images/videos), camera (on phones), and any supported file. */
export function FilePickers({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (list?.length) onFiles(Array.from(list));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  return (
    <>
      <div className="upload-row">
        <button type="button" className="up-btn" onClick={() => gallery.current?.click()} disabled={disabled}>
          <Images size={18} weight="bold" /> Gallery
        </button>
        <button type="button" className="up-btn" onClick={() => camera.current?.click()} disabled={disabled}>
          <Camera size={18} weight="bold" /> Camera
        </button>
        <button type="button" className="up-btn" onClick={() => docs.current?.click()} disabled={disabled}>
          <FileText size={18} weight="bold" /> Files
        </button>
      </div>
      <div
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        Drop screenshots, PDFs or documents here
      </div>
      {[
        { ref: gallery, accept: "image/*,video/*", capture: undefined },
        { ref: camera, accept: "image/*", capture: "environment" as const },
        { ref: docs, accept: ATTACHMENT_ACCEPT, capture: undefined },
      ].map(({ ref, accept, capture }, i) => (
        <input
          key={i}
          ref={ref}
          type="file"
          hidden
          multiple={!capture}
          accept={accept}
          capture={capture}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      ))}
    </>
  );
}

function FileTile({ name, type, src, onOpen, onRemove }: { name: string; type: string; src?: string; onOpen?: () => void; onRemove: () => void }) {
  const isImage = type.startsWith("image/") && type !== "image/heic";
  return (
    <div className="thumb" title={name}>
      <button type="button" onClick={onOpen} style={{ position: "absolute", inset: 0 }} aria-label={`Open ${name}`} />
      {isImage && src ? (
        <img src={src} alt={name} loading="lazy" />
      ) : (
        <>
          {type.startsWith("video/") ? <VideoCamera size={28} /> : <FileText size={28} />}
          <span className="thumb-name truncate">{name}</span>
        </>
      )}
      <button type="button" className="thumb-x" onClick={onRemove} aria-label={`Remove ${name}`}>
        <X size={12} weight="bold" />
      </button>
    </div>
  );
}

/** Files picked in the round form before the round exists; uploaded after save. */
export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : ""));
    setUrls(next);
    return () => next.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);
  if (!files.length) return null;
  return (
    <div className="thumbs">
      {files.map((f, i) => (
        <FileTile key={`${f.name}-${i}`} name={f.name} type={f.type} src={urls[i]} onRemove={() => onRemove(i)} />
      ))}
    </div>
  );
}

export function AttachmentsSection({ roundId }: { roundId: string }) {
  const qc = useQueryClient();
  const key = ["attachments", roundId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api<Attachment[]>(`/attachments?round_id=${encodeURIComponent(roundId)}`),
  });
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [toDelete, setToDelete] = useState<Attachment | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => api(`/attachments/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const upload = async (files: File[]) => {
    setErrors([]);
    setUploading({ done: 0, total: files.length });
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      try {
        await uploadAttachment(roundId, f);
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`);
      }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    setErrors(failed);
    qc.invalidateQueries({ queryKey: key });
  };

  const open = (a: Attachment) => {
    if (a.file_type.startsWith("image/") && a.file_type !== "image/heic") setPreview(a);
    else window.open(fileUrl(a.attachment_id, !["application/pdf", "video/mp4", "video/webm", "video/quicktime"].includes(a.file_type)), "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="section-head">
        <h2>Attachments ({data?.length ?? 0})</h2>
      </div>
      <FilePickers onFiles={upload} disabled={!!uploading} />
      {uploading ? <p className="small" role="status">Uploading {uploading.done + 1 > uploading.total ? uploading.total : uploading.done + 1} of {uploading.total}…</p> : null}
      {errors.length ? <ErrorNote error={`Some files failed to upload. ${errors.join(" · ")}`} /> : null}
      {isLoading ? <Spinner /> : null}
      <div className="thumbs">
        {(data ?? []).map((a) => (
          <FileTile
            key={a.attachment_id}
            name={`${a.file_name} (${formatBytes(a.size)})`}
            type={a.file_type}
            src={fileUrl(a.attachment_id)}
            onOpen={() => open(a)}
            onRemove={() => setToDelete(a)}
          />
        ))}
      </div>

      {preview ? (
        <div className="lightbox" onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-label={preview.file_name}>
          <img src={fileUrl(preview.attachment_id)} alt={preview.file_name} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-bar">
            <a className="icon-btn" href={fileUrl(preview.attachment_id, true)} aria-label="Download" onClick={(e) => e.stopPropagation()}>
              <DownloadSimple size={20} />
            </a>
            <button className="icon-btn" onClick={() => setPreview(null)} aria-label="Close"><X size={20} /></button>
          </div>
        </div>
      ) : null}

      <ConfirmSheet
        open={!!toDelete}
        title="Delete attachment?"
        message={toDelete?.file_name}
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.attachment_id)}
      />
    </>
  );
}
