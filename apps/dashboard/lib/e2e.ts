import { createHash, timingSafeEqual } from "node:crypto";
import type { IndexQueries } from "@factory/records";
import { loadNeedsYou } from "@/lib/cards-view";
import { loadThread } from "@/lib/thread-view";
import { requireQueries } from "@/lib/wiring";

// Read-only routes for the automated end-to-end test. They run the same read-only functions as
// the pages, behind FACTORY_API_TOKEN, and only ever for the factory-e2e project.
export const E2E_PROJECT = "factory-e2e";

export type E2eDeps = {
  token: () => string | undefined;
  queries: () => IndexQueries;
};

export const e2eDeps: E2eDeps = {
  token: () => process.env.FACTORY_API_TOKEN,
  queries: requireQueries,
};

const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** A response when the request must not go on: 503 no token set, 401 bad token, 403 wrong project. */
function refuse(req: Request, deps: E2eDeps, project: unknown): Response | undefined {
  const token = deps.token();
  if (!token) return json({ error: "Not configured." }, 503);
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!bearer || !same(bearer, token)) return json({ error: "Unauthorized." }, 401);
  if (project !== E2E_PROJECT) return json({ error: "Only factory-e2e is allowed." }, 403);
  return undefined;
}

const fail = (err: unknown) => json({ error: (err as Error).message }, 500);

export async function cardsRoute(req: Request, deps: E2eDeps = e2eDeps) {
  const project = new URL(req.url).searchParams.get("project");
  const refused = refuse(req, deps, project);
  if (refused) return refused;
  try {
    const q = deps.queries();
    return json({ cards: await loadNeedsYou(q, await q.cards(E2E_PROJECT)) });
  } catch (err) {
    return fail(err);
  }
}

export async function threadRoute(req: Request, id: string, deps: E2eDeps = e2eDeps) {
  const refused = refuse(req, deps, new URL(req.url).searchParams.get("project"));
  if (refused) return refused;
  try {
    const thread = await loadThread(deps.queries(), E2E_PROJECT, id);
    return thread ? json(thread) : json({ error: "Not found." }, 404);
  } catch (err) {
    return fail(err);
  }
}
