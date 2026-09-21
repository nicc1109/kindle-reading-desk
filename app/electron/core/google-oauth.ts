import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const GOOGLE_DOCS_SCOPE = "https://www.googleapis.com/auth/drive.file";
export interface GoogleOAuthClient { clientId: string; clientSecret?: string }

export function parseGoogleOAuthClient(input: unknown): GoogleOAuthClient {
  const config = input as { installed?: { client_id?: unknown; client_secret?: unknown } };
  const client = config?.installed;
  if (!client || typeof client.client_id !== "string" || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client.client_id)) {
    throw new Error("Google Docs requires a Google OAuth Desktop app client configuration.");
  }
  if (client.client_secret !== undefined && typeof client.client_secret !== "string") throw new Error("Invalid Google OAuth configuration.");
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

export async function authorizeGoogleDocs(
  client: GoogleOAuthClient,
  openBrowser: (url: string) => Promise<void>,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const server = createServer();
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("Could not start Google sign-in."); }
  const redirectUri = `http://127.0.0.1:${address.port}`;
  try {
    const code = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, code?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(code!);
      };
      const abort = () => finish(new Error("Google sign-in was canceled."));
      const timer = setTimeout(() => finish(new Error("Google sign-in timed out. Please try again.")), 120_000);
      signal.addEventListener("abort", abort, { once: true });
      server.on("request", (request, response) => {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        const url = new URL(request.url || "/", redirectUri);
        if (request.method !== "GET" || url.pathname !== "/" || url.searchParams.get("state") !== state) {
          response.writeHead(400).end("Invalid sign-in response.");
          return;
        }
        const code = url.searchParams.get("code");
        if (url.searchParams.has("error") || !code) {
          response.end("Google access was not granted. Return to Reading Desk.");
          finish(new Error("Google access was not granted. No document was created."));
        } else {
          response.end("Sign-in received. Return to Reading Desk to see the export result.");
          finish(undefined, code);
        }
      });
      if (signal.aborted) { abort(); return; }
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: client.clientId, redirect_uri: redirectUri, response_type: "code",
        scope: GOOGLE_DOCS_SCOPE, code_challenge: challenge, code_challenge_method: "S256",
        state, access_type: "online", prompt: "select_account",
      }).toString();
      void openBrowser(url.toString()).catch(() => finish(new Error("Could not open the browser for Google sign-in.")));
    });
    const body = new URLSearchParams({ client_id: client.clientId, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" });
    if (client.clientSecret) body.set("client_secret", client.clientSecret);
    let response: Response;
    try {
      signal.throwIfAborted();
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", body, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
    } catch {
      if (signal.aborted) throw new Error("Google sign-in was canceled.");
      throw new Error("Google sign-in could not reach the token service. Check your connection and try again.");
    }
    if (!response.ok) {
      if (response.status === 400) throw new Error("Google sign-in expired or the authorization code was already used. Please try again.");
      throw new Error("Google sign-in could not be completed. Check the desktop OAuth configuration and try again.");
    }
    const token = await response.json() as { access_token?: string; scope?: string };
    if (!token.access_token || !token.scope?.split(" ").includes(GOOGLE_DOCS_SCOPE)) throw new Error("Google did not grant permission to create documents.");
    return token.access_token;
  } finally {
    server.close();
    server.closeAllConnections();
  }
}
