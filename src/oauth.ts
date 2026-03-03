import { Redis } from "@upstash/redis";
import { createHash, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const redis = Redis.fromEnv();

// --- Firebase Admin ---

function getFirebaseAuth() {
  if (getApps().length === 0) {
    const serviceAccount: ServiceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    };
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}

export async function verifyFirebaseToken(
  idToken: string
): Promise<{ uid: string; email?: string; name?: string } | null> {
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email, name: decoded.name };
  } catch {
    return null;
  }
}

// --- Client Registration ---

interface OAuthClient {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
  created_at: string;
}

export async function saveClient(client: OAuthClient): Promise<void> {
  await redis.set(`oauth:client:${client.client_id}`, JSON.stringify(client));
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const data = await redis.get<string>(`oauth:client:${clientId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

// --- Authorization Codes ---

interface AuthCode {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
}

export async function saveAuthCode(code: string, data: AuthCode): Promise<void> {
  // 10 minute TTL
  await redis.set(`oauth:code:${code}`, JSON.stringify(data), { ex: 600 });
}

export async function getAuthCode(code: string): Promise<AuthCode | null> {
  const data = await redis.get<string>(`oauth:code:${code}`);
  if (!data) return null;
  // Delete after use (single-use codes)
  await redis.del(`oauth:code:${code}`);
  return typeof data === "string" ? JSON.parse(data) : data;
}

// --- Access Tokens ---

export async function saveAccessToken(token: string, userId: string): Promise<void> {
  // 30 day TTL
  await redis.set(`oauth:token:${token}`, JSON.stringify({ user_id: userId }), { ex: 60 * 60 * 24 * 30 });
}

export async function validateAccessToken(token: string): Promise<string | null> {
  const data = await redis.get<string>(`oauth:token:${token}`);
  if (!data) return null;
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return (parsed as { user_id: string }).user_id ?? null;
}

// --- PKCE ---

export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash("sha256").update(codeVerifier).digest("base64url");
  return hash === codeChallenge;
}

// --- Helpers ---

export function generateId(): string {
  return randomBytes(32).toString("hex");
}
