# flashcard-mcp

An MCP server that gives Claude (or any MCP client) the ability to create, review, and manage flashcards with spaced repetition (SM-2 algorithm).

Organize cards into projects, tag them by topic, and let the scheduling algorithm figure out when you need to see each card again.

100% vibecoded.

## Blog post

Read about how I use this MCP to learn math: [Flashcards MCP](https://louisarge.com/blog/flashcards-mcp)

## Installation

The server URL is:

```
https://flashcards.louisarge.com/api/mcp
```

It works out of the box — just add it as a remote MCP server in your client and sign in with Google when prompted.

### Video tutorials

- [Installing in Claude](install-claude.mp4)
- [Installing in ChatGPT](install-chatgpt.mp4)

## Tools

- `create_project` / `list_projects` — organize cards into projects
- `read_memory` / `write_memory` / `edit_memory` — persistent per-project notes and context
- `create_flashcard` / `edit_flashcard` / `list_flashcards` / `delete_flashcard` — manage cards
- `get_due_flashcards` — get cards that are due for review
- `review_flashcard` — record how well you remembered (1-4), updates the schedule
- `get_flashcard_answer` — reveal the answer after quizzing yourself

## Self-hosting

The `api/mcp.ts` endpoint runs as a Vercel serverless function, backed by Upstash Redis.

Connect an Upstash Redis database via Vercel's Storage integration — it'll set up `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

### Firebase setup

Authentication uses Firebase Google Sign-In. You'll need a Firebase project with Google auth enabled.

**Server environment variables** (set in Vercel):

- `FIREBASE_PROJECT_ID` — Firebase project ID
- `FIREBASE_CLIENT_EMAIL` — Firebase service account email
- `FIREBASE_PRIVATE_KEY` — Firebase service account private key, PEM format

**Client-side Firebase config** lives in `api/authorize.ts` — update the `firebase.initializeApp({...})` block with your own Firebase project credentials.
