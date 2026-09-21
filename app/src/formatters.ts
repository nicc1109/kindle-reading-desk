import type { ClippingRecord } from "../shared/types";

export function formatDate(value?: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function locationLabel(clip: ClippingRecord): string {
  const values: string[] = [];
  if (clip.pageStart) values.push(`Page ${clip.pageStart}${clip.pageEnd && clip.pageEnd !== clip.pageStart ? `–${clip.pageEnd}` : ""}`);
  if (clip.locationStart !== undefined) values.push(`Location ${clip.locationStart}${clip.locationEnd !== clip.locationStart ? `–${clip.locationEnd}` : ""}`);
  return values.join(" · ") || "No location";
}
