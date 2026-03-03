import { Redis } from "@upstash/redis";
import type { Store, StoreBackend } from "./store.js";

export class KVStore implements StoreBackend {
  private redis: Redis;
  private key: string;

  constructor(userId: string) {
    this.redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
    this.key = `user:${userId}:flashcards`;
  }

  async load(): Promise<Store> {
    const data = await this.redis.get<Store>(this.key);
    if (!data) return { projects: [], flashcards: [] };
    if (!data.projects) data.projects = [];
    for (const p of data.projects) {
      if (p.memory === undefined) p.memory = "";
    }
    return data;
  }

  async save(store: Store): Promise<void> {
    await this.redis.set(this.key, store);
  }
}
