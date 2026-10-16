import { mcpHandler } from "@/lib/mcp/server";

// The factory MCP server: agents query records by ID here.
export const dynamic = "force-dynamic";

export { mcpHandler as GET, mcpHandler as POST, mcpHandler as DELETE };
