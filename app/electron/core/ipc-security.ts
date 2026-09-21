import type { BookPatch, BookStatus, ClippingPatch } from "../../shared/types.js";

interface FrameLike { url: string }
interface IpcEventLike { sender: unknown; senderFrame?: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertTrustedIpcEvent(
  event: IpcEventLike,
  expectedSender: unknown,
  expectedFrame: unknown,
  expectedUrl: string | null,
): void {
  const frame = event.senderFrame as FrameLike | undefined;
  if (!expectedSender || event.sender !== expectedSender || !expectedFrame || event.senderFrame !== expectedFrame) {
    throw new Error("Unauthorized IPC sender");
  }
  if (!expectedUrl || frame?.url !== expectedUrl) throw new Error("Unauthorized IPC frame URL");
}

export function requireString(value: unknown, label: string, maximum = 4_096): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Invalid ${label}`);
  return value;
}

function requireOptionalString(value: unknown, label: string): void {
  if (value !== undefined && (typeof value !== "string" || value.length > 100_000)) throw new Error(`Invalid ${label}`);
}

function requireStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length > 1_000 || value.some((item) => typeof item !== "string" || item.length > 1_000)) {
    throw new Error(`Invalid ${label}`);
  }
}

export function requireBookPatch(value: unknown): BookPatch {
  if (!isRecord(value)) throw new Error("Invalid book patch");
  const allowed = new Set(["title", "authors", "status", "rating", "tags", "startedAt", "finishedAt", "reflection"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Invalid book patch field");
  requireOptionalString(value.title, "book title");
  requireOptionalString(value.startedAt, "started date");
  requireOptionalString(value.finishedAt, "finished date");
  requireOptionalString(value.reflection, "book reflection");
  if (value.authors !== undefined) requireStringArray(value.authors, "authors");
  if (value.tags !== undefined) requireStringArray(value.tags, "book tags");
  if (value.status !== undefined && !(["Reading", "Finished", "Paused", "Reference"] as BookStatus[]).includes(value.status as BookStatus)) {
    throw new Error("Invalid book status");
  }
  if (value.rating !== undefined && (typeof value.rating !== "number" || !Number.isFinite(value.rating))) throw new Error("Invalid rating");
  return value as BookPatch;
}

export function requireClippingPatch(value: unknown): ClippingPatch {
  if (!isRecord(value)) throw new Error("Invalid clipping patch");
  const allowed = new Set(["favorite", "tags", "reflection"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Invalid clipping patch field");
  if (value.favorite !== undefined && typeof value.favorite !== "boolean") throw new Error("Invalid favorite value");
  if (value.tags !== undefined) requireStringArray(value.tags, "clipping tags");
  requireOptionalString(value.reflection, "clipping reflection");
  return value as ClippingPatch;
}

export function requireConflictResolution(value: unknown): "skip" | "add-separately" {
  if (value !== "skip" && value !== "add-separately") throw new Error("Invalid conflict resolution");
  return value;
}
