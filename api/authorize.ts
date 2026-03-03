import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClient, saveAuthCode, generateId, verifyFirebaseToken } from "../src/oauth.js";

function loginPage(params: Record<string, string>, error?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flashcard MCP - Sign In</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 80px auto; padding: 0 20px; }
    h1 { font-size: 1.4em; }
    .error { color: #c00; font-size: 0.9em; }
    #google-btn {
      display: inline-flex; align-items: center; gap: 12px;
      padding: 10px 24px; font-size: 1em;
      background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px;
      cursor: pointer; font-family: system-ui, sans-serif;
    }
    #google-btn:hover { background: #f7f7f7; }
    #google-btn svg { width: 20px; height: 20px; }
    #status { margin-top: 16px; color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Flashcard MCP</h1>
  <p>Sign in with your Google account to authorize access.</p>
  ${error ? `<p class="error">${error}</p>` : ""}
  <button id="google-btn" onclick="signIn()">
    <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.9 7.35 2.56 10.53l7.97-5.94z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.94C6.51 42.62 14.62 48 24 48z"/></svg>
    Sign in with Google
  </button>
  <div id="status"></div>

  <form id="auth-form" method="POST" action="/api/authorize" style="display:none">
    <input type="hidden" name="firebase_id_token" id="firebase_id_token">
    ${Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
      .join("\n    ")}
  </form>

  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script>
    firebase.initializeApp({
      apiKey: "AIzaSyBZ9UpCoGko3BvtYiufUApIMpN2XZC4Xug",
      authDomain: "flashcards-mcp.firebaseapp.com",
      projectId: "flashcards-mcp",
      storageBucket: "flashcards-mcp.firebasestorage.app",
      messagingSenderId: "683252912714",
      appId: "1:683252912714:web:382fadfebcab46676f8cb3"
    });

    async function signIn() {
      var status = document.getElementById("status");
      try {
        status.textContent = "Signing in...";
        var provider = new firebase.auth.GoogleAuthProvider();
        var result = await firebase.auth().signInWithPopup(provider);
        var idToken = await result.user.getIdToken();
        document.getElementById("firebase_id_token").value = idToken;
        status.textContent = "Authorizing...";
        document.getElementById("auth-form").submit();
      } catch (err) {
        status.textContent = "Sign-in failed: " + err.message;
      }
    }
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Render sign-in page, carry OAuth params through as hidden fields
    const params: Record<string, string> = {};
    for (const key of ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "response_type"]) {
      const val = req.query[key];
      if (typeof val === "string") params[key] = val;
    }

    res.setHeader("Content-Type", "text/html");
    res.send(loginPage(params));
    return;
  }

  if (req.method === "POST") {
    const {
      firebase_id_token,
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
      response_type,
    } = req.body || {};

    // Carry params through for re-rendering form on error
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries({ client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, response_type })) {
      if (typeof v === "string") params[k] = v;
    }

    // Verify Firebase ID token
    if (!firebase_id_token) {
      res.setHeader("Content-Type", "text/html");
      res.status(200).send(loginPage(params, "Missing authentication token."));
      return;
    }

    const user = await verifyFirebaseToken(firebase_id_token);
    if (!user) {
      res.setHeader("Content-Type", "text/html");
      res.status(200).send(loginPage(params, "Authentication failed. Please try again."));
      return;
    }

    // Validate client
    if (!client_id) {
      res.status(400).send("Missing client_id");
      return;
    }
    const client = await getClient(client_id);
    if (!client) {
      res.status(400).send("Unknown client_id");
      return;
    }

    // Validate redirect_uri
    if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
      res.status(400).send("Invalid redirect_uri");
      return;
    }

    // Require PKCE
    if (!code_challenge || code_challenge_method !== "S256") {
      res.status(400).send("PKCE with S256 is required");
      return;
    }

    // Generate auth code
    const code = generateId();
    await saveAuthCode(code, {
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      user_id: user.uid,
    });

    // Redirect back to client
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(302, redirectUrl.toString());
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
