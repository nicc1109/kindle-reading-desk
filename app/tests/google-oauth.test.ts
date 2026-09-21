import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeGoogleDocs, GOOGLE_DOCS_SCOPE, parseGoogleOAuthClient } from "../electron/core/google-oauth";

afterEach(() => vi.unstubAllGlobals());
const client = { clientId: "123-test.apps.googleusercontent.com", clientSecret: "desktop-client-secret" };

describe("Google OAuth desktop flow", () => {
  it("requires an installed client and refuses web credentials", () => {
    expect(parseGoogleOAuthClient({ installed: { client_id: client.clientId } })).toEqual({ clientId: client.clientId });
    expect(() => parseGoogleOAuthClient({ web: { client_id: client.clientId } })).toThrow("Desktop app");
    expect(() => parseGoogleOAuthClient(null)).toThrow("Desktop app");
  });

  it("uses loopback, validates state and exchanges a PKCE code with minimal scope", async () => {
    const realFetch = fetch;
    let authUrl: URL;
    const tokenFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ access_token: "account-token", scope: GOOGLE_DOCS_SCOPE })));
    vi.stubGlobal("fetch", tokenFetch);
    const open = async (url: string) => {
      authUrl = new URL(url);
      const redirect = authUrl.searchParams.get("redirect_uri")!;
      expect(new URL(redirect).hostname).toBe("127.0.0.1");
      const invalid = await realFetch(`${redirect}/?state=wrong&code=evil`);
      expect(invalid.status).toBe(400);
      await realFetch(`${redirect}/?state=${authUrl.searchParams.get("state")}&code=good-code`);
    };
    expect(await authorizeGoogleDocs(client, open, new AbortController().signal)).toBe("account-token");
    expect(authUrl!.searchParams.get("scope")).toBe(GOOGLE_DOCS_SCOPE);
    expect(authUrl!.searchParams.get("access_type")).toBe("online");
    const parameters = tokenFetch.mock.calls[0][1]!.body as URLSearchParams;
    expect(parameters.get("code")).toBe("good-code");
    expect(createHash("sha256").update(parameters.get("code_verifier")!).digest("base64url")).toBe(authUrl!.searchParams.get("code_challenge"));
    await expect(realFetch(authUrl!.searchParams.get("redirect_uri")!)).rejects.toThrow();
  });

  it("handles denied consent without exchanging a token", async () => {
    const realFetch = fetch;
    const tokenFetch = vi.fn();
    vi.stubGlobal("fetch", tokenFetch);
    await expect(authorizeGoogleDocs(client, async (url) => {
      const auth = new URL(url);
      await realFetch(`${auth.searchParams.get("redirect_uri")}/?state=${auth.searchParams.get("state")}&error=access_denied`);
    }, new AbortController().signal)).rejects.toThrow("not granted");
    expect(tokenFetch).not.toHaveBeenCalled();
  });

  it("cancels while waiting for browser consent and handles browser launch failure", async () => {
    const controller = new AbortController();
    await expect(authorizeGoogleDocs(client, async () => { controller.abort(); }, controller.signal)).rejects.toThrow("canceled");
    await expect(authorizeGoogleDocs(client, async () => { throw new Error("shell failed"); }, new AbortController().signal)).rejects.toThrow("open the browser");
  });

  it("reports cancellation during the token exchange clearly", async () => {
    const realFetch = fetch;
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
      const tokenSignal = options?.signal;
      tokenSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    await expect(authorizeGoogleDocs(client, async (url) => {
      const auth = new URL(url);
      await realFetch(`${auth.searchParams.get("redirect_uri")}/?state=${auth.searchParams.get("state")}&code=good-code`);
      controller.abort();
    }, controller.signal)).rejects.toThrow("canceled");
  });
});
