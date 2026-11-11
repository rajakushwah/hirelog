import { useNavigate } from "react-router-dom";

/** history.back() leaves the app when a page was opened directly (bookmark / refresh); fall back to a known route. */
export function useBack(fallback: string): () => void {
  const nav = useNavigate();
  return () => {
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) nav(-1);
    else nav(fallback, { replace: true });
  };
}
