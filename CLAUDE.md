# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install
npm run build    # tsc → dist/
```

Deployed as Vercel serverless functions. No local stdio mode.

No test framework is configured.

## Architecture

This is an **MCP (Model Context Protocol) flashcard server** deployed as Vercel serverless functions over HTTP, with OAuth 2.1 auth and Firebase Google Sign-In. Each user's data is isolated by Firebase UID.

### Entry point

- **`api/mcp.ts`** — HTTP mode. Uses `KVStore` (Upstash Redis). Deployed as a Vercel serverless function with OAuth 2.1 Bearer token validation. Extracts user ID from the access token and scopes all data access to that user.

### Storage abstraction

`StoreBackend` interface (`src/store.ts`) abstracts persistence. One implementation:
- `KVStore` (`src/kv-store.ts`) — Upstash Redis via `@upstash/redis`, keyed per-user as `user:{uid}:flashcards`

Stores the shape: `{ projects: Project[], flashcards: Flashcard[] }`.

### Tool registration

`src/tools.ts` exports `registerTools(server, store)` which wires up all MCP tools (CRUD for projects/flashcards, due card retrieval, review recording). The tools are framework-agnostic — they take a `StoreBackend` and work identically regardless of backing store.

### Spaced repetition

`src/sr.ts` implements SM-2. Quality 1-2 resets progress; quality 3-4 advances intervals (1d → 3d → ease_factor multiplier). Ease factor floors at 1.3.

### Authentication: Firebase + OAuth 2.1

PKCE-only OAuth 2.1 flow for public MCP clients, with Firebase Google Sign-In as the identity provider.

**Flow:**
1. MCP client redirects to `GET /api/authorize` → renders "Sign in with Google" page
2. User signs in via Firebase popup → client-side JS gets Firebase ID token
3. POST `/api/authorize` with ID token → server verifies via Firebase Admin SDK → creates auth code with `user_id`
4. POST `/api/token` → exchanges code for access token (stored in Redis with `user_id`)
5. POST `/api/mcp` with Bearer token → validates token → extracts `userId` → creates `KVStore(userId)`

**OAuth endpoints (`api/`):**
- `api/authorize.ts` — Google Sign-In page + authorization code grant
- `api/token.ts` — code-for-token exchange with PKCE verification
- `api/register.ts` — dynamic client registration
- `api/oauth-metadata.ts` / `api/resource-metadata.ts` — `.well-known` endpoints
- `src/oauth.ts` — shared utilities (PKCE, Firebase token verification, token/client management)

All OAuth state (codes, tokens, clients) stored in Upstash Redis with TTLs.

## Environment Variables

For Vercel deployment:
- `KV_REST_API_URL` — Upstash Redis REST endpoint (required)
- `KV_REST_API_TOKEN` — Upstash REST API token (required)
- `FIREBASE_PROJECT_ID` — Firebase project ID (required)
- `FIREBASE_CLIENT_EMAIL` — Firebase service account email (required)
- `FIREBASE_PRIVATE_KEY` — Firebase service account private key, PEM format (required)

## Key Conventions

- ES Modules throughout (`"type": "module"` in package.json)
- TypeScript strict mode, target ES2022, module Node16
- Vercel functions live in `api/`, compiled source in `src/` → `dist/`
- Per-user data isolation: all flashcard/project data namespaced by Firebase UID in Redis
