import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { KVStore } from "../src/kv-store.js";
import { registerTools } from "../src/tools.js";
import { validateAccessToken } from "../src/oauth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Auth: OAuth token only
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  const userId = token ? await validateAccessToken(token) : null;

  if (!userId) {
    const host = `https://${req.headers.host}`;
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${host}/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Create server + tools per request (stateless mode)
  const server = new McpServer({ name: "flashcard-mcp", version: "0.4.0" });
  registerTools(server, new KVStore(userId));

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
