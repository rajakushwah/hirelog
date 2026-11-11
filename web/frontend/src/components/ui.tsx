import { useEffect, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Briefcase } from "@phosphor-icons/react";
import { statusColor, useTheme } from "../theme";

export function Spinner({ full }: { full?: boolean }) {
  return (
    <div className={`center${full ? " full" : ""}`} role="status" aria-label="Loading">
      <span className="spinner" />
    </div>
  );
}

export function InlineSpinner() {
  return <span className="spinner" role="status" aria-label="Loading" style={{ width: 18, height: 18 }} />;
}

type Kind = "application" | "interview" | "result" | "difficulty";

export function StatusBadge({ status, kind }: { status: string; kind: Kind }) {
  const { colors } = useTheme();
  const { bg, fg } = statusColor(colors, status, kind);
  return (
    <span className="badge" style={{ backgroundColor: bg, color: fg }}>
      {status}
    </span>
  );
}

type ChipProps<T extends string> = { options: readonly T[]; wrap?: boolean; label?: string } & (
  | { multi?: false; value: T; onChange: (v: T) => void }
  | { multi: true; value: T[]; onChange: (v: T[]) => void }
);

export function ChipRow<T extends string>(props: ChipProps<T>) {
  const isSelected = (opt: T) => (props.multi ? props.value.includes(opt) : props.value === opt);
  const toggle = (opt: T) => {
    if (props.multi) {
      props.onChange(props.value.includes(opt) ? props.value.filter((v) => v !== opt) : [...props.value, opt]);
    } else {
      props.onChange(opt);
    }
  };
  return (
    <div className={`chips${props.wrap ? " wrap" : ""}`} role={props.multi ? "group" : "radiogroup"} aria-label={props.label}>
      {props.options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <button
            type="button"
            key={opt}
            className={`chip${selected ? " selected" : ""}`}
            onClick={() => toggle(opt)}
            role={props.multi ? "checkbox" : "radio"}
            aria-checked={selected}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

type FieldBase = { label: string; error?: string };

export function Field({ label, error, ...props }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={`input${error ? " invalid" : ""}`} aria-invalid={!!error} {...props} />
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function TextArea({ label, error, ...props }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className={`input${error ? " invalid" : ""}`} aria-invalid={!!error} {...props} />
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-circle">{icon ?? <Briefcase size={28} weight="fill" />}</div>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {actionLabel && onAction ? (
        <button className="btn btn-primary" onClick={onAction} style={{ marginTop: 12 }}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onCancel,
  children,
  confirmDisabled,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onCancel} label={title}>
      <h2>{title}</h2>
      {message ? <p className="sub" style={{ margin: 0 }}>{message}</p> : null}
      {children}
      <button className="btn btn-danger lg block" onClick={onConfirm} disabled={busy || confirmDisabled} style={{ marginTop: 8 }}>
        {busy ? <InlineSpinner /> : confirmLabel}
      </button>
      <button className="btn btn-secondary lg block" onClick={onCancel}>
        Cancel
      </button>
    </Sheet>
  );
}

export function KV({ label, value, multi, children }: { label: string; value?: string; multi?: boolean; children?: ReactNode }) {
  return (
    <div className={`kv-row${multi ? " multi" : ""}`}>
      <span className="kv-label">{label}</span>
      <span className="kv-val">{children ?? (value || "—")}</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
