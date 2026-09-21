import type { BookStatus } from "../../shared/types";

export function StatusDot({ status }: { status: BookStatus }) {
  return <span className={`status-dot status-${status.toLowerCase()}`} aria-hidden="true" />;
}
