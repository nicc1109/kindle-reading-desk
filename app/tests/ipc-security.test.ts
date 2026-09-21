import { describe, expect, it } from "vitest";
import { assertTrustedIpcEvent, requireBookPatch, requireClippingPatch, requireConflictResolution, requireString } from "../electron/core/ipc-security";

describe("Electron IPC security", () => {
  it("accepts only the current main frame and renderer URL", () => {
    const sender = {};
    const frame = { url: "file:///app/index.html" };
    expect(() => assertTrustedIpcEvent({ sender, senderFrame: frame }, sender, frame, frame.url)).not.toThrow();
    expect(() => assertTrustedIpcEvent({ sender: {}, senderFrame: frame }, sender, frame, frame.url)).toThrow("Unauthorized IPC sender");
    expect(() => assertTrustedIpcEvent({ sender, senderFrame: { url: frame.url } }, sender, frame, frame.url)).toThrow("Unauthorized IPC sender");
    expect(() => assertTrustedIpcEvent({ sender, senderFrame: frame }, sender, frame, "https://attacker.example")).toThrow("Unauthorized IPC frame URL");
  });

  it("rejects malformed runtime arguments and unexpected patch fields", () => {
    expect(requireString("book-1", "book ID")).toBe("book-1");
    expect(() => requireString("", "book ID")).toThrow("Invalid book ID");
    expect(requireBookPatch({ status: "Finished", tags: ["study"] })).toEqual({ status: "Finished", tags: ["study"] });
    expect(() => requireBookPatch({ status: "Deleted" })).toThrow("Invalid book status");
    expect(() => requireBookPatch({ title: "Book", executable: true })).toThrow("Invalid book patch field");
    expect(requireClippingPatch({ favorite: true, reflection: "Note" })).toEqual({ favorite: true, reflection: "Note" });
    expect(() => requireClippingPatch({ favorite: "yes" })).toThrow("Invalid favorite value");
    expect(() => requireConflictResolution("overwrite")).toThrow("Invalid conflict resolution");
  });
});
