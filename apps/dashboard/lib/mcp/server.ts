import { createHash, timingSafeEqual } from "node:crypto";
import type { IndexQueries } from "@factory/records";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { agentFrom } from "./scopes";
import { registerTools } from "./tools";

export type McpDeps = { token: () => string | undefined; queries: () => IndexQueries | undefined };

const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/**
 * The factory MCP server (spike 3). Agents query records by ID and by link here instead of reading
 * record folders. Bearer token: MCP_TOKEN. The calling agent comes from the X-Factory-Agent header.
 */
export function makeMcpHandler(deps: McpDeps) {
  const handler = createMcpHandler((server) => registerTools(server, deps.queries), {
    serverInfo: { name: "transpera-factory", version: "0.2.0" },
  });
  return withMcpAuth(
    handler,
    (req, bearer) => {
      const token = deps.token();
      return token && bearer && same(bearer, token)
        ? {
            token: bearer,
            clientId: "factory-agent",
            scopes: [],
            extra: { agent: agentFrom(req.headers) },
          }
        : undefined;
    },
    { required: true },
  );
}

// S3's createIndexQueries(createDb()) isn't on this branch yet. Swap it in here when S3 lands on f01.
function productionQueries(): IndexQueries | undefined {
  return undefined;
}

export const mcpHandler = makeMcpHandler({
  token: () => process.env.MCP_TOKEN,
  queries: productionQueries,
});
