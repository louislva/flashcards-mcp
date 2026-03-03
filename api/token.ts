import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthCode, saveAccessToken, verifyPKCE, generateId } from "../src/oauth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { grant_type, code, code_verifier, client_id, redirect_uri } = req.body || {};

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (!code || !code_verifier || !client_id || !redirect_uri) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing required parameters" });
    return;
  }

  // Look up auth code (also deletes it — single use)
  const authCode = await getAuthCode(code);
  if (!authCode) {
    res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" });
    return;
  }

  // Validate client_id matches
  if (authCode.client_id !== client_id) {
    res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
    return;
  }

  // Validate redirect_uri matches
  if (authCode.redirect_uri !== redirect_uri) {
    res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }

  // Verify PKCE
  if (!verifyPKCE(code_verifier, authCode.code_challenge)) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }

  // Issue access token
  const accessToken = generateId();
  await saveAccessToken(accessToken, authCode.user_id);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 60 * 60 * 24 * 30, // 30 days
  });
}
