import { AGENT_READ_SCOPES } from "@factory/records";

/** The calling agent, from the X-Factory-Agent header. Anything but lower-case letters, digits and dashes counts as unset. */
export function agentFrom(headers: Headers): string | undefined {
  const v = headers.get("x-factory-agent");
  return v && /^[a-z0-9-]+$/.test(v) ? v : undefined;
}

/** Whether the agent may read records of this type. An agent not listed, or unset, reads everything. */
export function canRead(agent: string | undefined, type: string): boolean {
  const scope = agent ? AGENT_READ_SCOPES[agent] : undefined;
  return !scope || scope.includes(type);
}
