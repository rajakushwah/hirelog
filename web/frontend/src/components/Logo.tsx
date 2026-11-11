export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return <img src="/logo.svg" alt="" width={size} height={size} className={`logo-img ${className}`.trim()} draggable={false} />;
}
