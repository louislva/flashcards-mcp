import type { VercelRequest, VercelResponse } from "@vercel/node";
import { KVStore } from "../src/kv-store.js";
import { verifyFirebaseToken } from "../src/oauth.js";
import { nextReview } from "../src/sr.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const auth = req.headers.authorization;
  const idToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!idToken) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }
  const user = await verifyFirebaseToken(idToken);
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const store = new KVStore(user.uid);

  if (req.method === "GET") {
    const data = await store.load();
    const now = new Date().toISOString();
    const project = typeof req.query.project === "string" ? req.query.project : null;

    if (!project) {
      const projects = data.projects.map((p) => {
        const cards = data.flashcards.filter((c) => c.project === p.name);
        return {
          name: p.name,
          description: p.description,
          total: cards.length,
          due: cards.filter((c) => c.next_review <= now).length,
        };
      });
      res.status(200).json({ projects });
      return;
    }

    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20;
    let due = data.flashcards.filter((c) => c.project === project && c.next_review <= now);
    due.sort((a, b) => a.next_review.localeCompare(b.next_review));
    due = due.slice(0, isFinite(limit) ? limit : 20);
    const cards = due.map((c) => ({ id: c.id, front: c.front, back: c.back, tags: c.tags }));
    res.status(200).json({ cards });
    return;
  }

  if (req.method === "POST") {
    const { id, quality } = (req.body || {}) as { id?: string; quality?: number };
    if (!id || typeof quality !== "number" || quality < 1 || quality > 4) {
      res.status(400).json({ error: "id and quality (1-4) required" });
      return;
    }
    const data = await store.load();
    const idx = data.flashcards.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: "Flashcard not found" });
      return;
    }
    data.flashcards[idx] = nextReview(data.flashcards[idx], quality);
    await store.save(data);
    const card = data.flashcards[idx];
    res.status(200).json({
      scheduled_days: card.scheduled_days,
      next_review: card.next_review,
    });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
