import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, authState } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  authState: { configured: true, session: null as unknown },
}));
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({
  get authConfigured() {
    return authState.configured;
  },
  auth: async () => authState.session,
  signOut: vi.fn(),
}));

import { NeedsYou } from "@/app/components/NeedsYou";
import { BrTable, ThreadDetail } from "@/app/components/Thread";
import { loadNeedsYou } from "@/lib/cards-view";
import { fakeQueries } from "@/lib/fake-index";
import { requireAllowed } from "@/lib/session";
import { loadBrTable, loadThread } from "@/lib/thread-view";

beforeEach(() => {
  redirect.mockClear();
  authState.configured = true;
  authState.session = null;
});

describe("sign-in checks", () => {
  it("redirects signed-out and wrong-account requests", async () => {
    await expect(requireAllowed()).rejects.toThrow("REDIRECT /signin");
    authState.session = { githubId: "999" };
    await expect(requireAllowed()).rejects.toThrow("REDIRECT /signin");
    authState.configured = false;
    await expect(requireAllowed()).rejects.toThrow("REDIRECT /signin");
  });

  it("lets Austin through", async () => {
    authState.session = { githubId: "318214427" };
    await expect(requireAllowed()).resolves.toBeTruthy();
  });
});

describe("rendering", () => {
  const q = fakeQueries();

  it("renders the Needs you cards as text with no forms", async () => {
    const html = renderToStaticMarkup(<NeedsYou items={await loadNeedsYou(q)} />);
    expect(html).toContain("Drivers want a mobile app.");
    expect(html).toContain("tell Claude in your project session");
    expect(html).toContain("Confirm claims from");
    expect(html).toContain("Saves two hours a day");
    expect(html).toContain("We lose two hours a day re-keying orders.");
    expect(html).toContain("Approve BR-01 v1");
    expect(html).toContain('href="/thread/acme/BR-01"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });

  it("renders the BR table and the thread with its quotes", async () => {
    const table = renderToStaticMarkup(
      <BrTable project="acme" rows={await loadBrTable(q, "acme")} />,
    );
    expect(table).toContain("BR-01");
    expect(table).toContain("review");
    const thread = (await loadThread(q, "acme", "BR-01"))!;
    expect(thread.evidence).toHaveLength(1);
    const html = renderToStaticMarkup(<ThreadDetail project="acme" thread={thread} />);
    expect(html).toContain("We lose two hours a day re-keying orders.");
    expect(html).toContain("Sarah Kim");
    expect(html).toContain("SRC-001");
    expect(html).toContain("L12");
    expect(html).toContain('href="/thread/acme"');
  });
});
