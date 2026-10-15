# S0-1: Can Vercel Hobby deploy our private org repo?

15 Oct 2026 · Answer: **yes. Stay on Hobby.**

## Question

Can the free Vercel Hobby plan deploy `transperaai/Software-factory`, a private repo in a GitHub organisation, when commits are made by Claude or by GitHub Actions rather than by Austin?

## What we tried

| Commit | Author | Result |
| --- | --- | --- |
| Merges of #3 to #7 on `main` | Austin (`transperaai`) | Production deploys. `https://transpera-factory.vercel.app/api/health` reports commit `f0dbbb8`, branch `main`, environment `production` |
| PR previews for #4 to #7 | `Claude <noreply@anthropic.com>` | Ready |
| `b964d0b` on `hobby-check/bot`, pushed by the "Hobby check (bot commit)" workflow | `github-actions[bot]` | Ready (preview) |

## What happened

- **The first deploys failed, but not because of Hobby.** Vercel detected Turbo and fell back to a static preset, then looked for a `public` folder after a successful `next build`. Fixed in #7 with `apps/dashboard/vercel.json` setting `"framework": "nextjs"`, so the setting is kept in git.
- **The Vercel project was created twice during import.** The old one (`transpera-factory-…-rTHc`) still showed an error row on #4. It should be deleted if it still exists.
- **Previews sit behind Vercel Authentication,** Hobby's default. Austin can open them while logged in to Vercel. Production is public. Agents can't open previews without a Vercel login, which matters for the QA explorer in F-06, not now.
- **Open loose end:** the first bot-commit run (`c39e889`, 09:27 UTC) produced no deployment we could find. The second run, about six minutes later, deployed normally. The cause is unknown. If bot-authored deploys ever go missing again, check this first.

## Decision

- Stay on Hobby. No paid plan and no workaround needed now.
- Keep `vercel.json` in git for project settings that can live there.
- **If bot deploys turn out to be unreliable:** the free fallback is deploying from a GitHub Action with the Vercel CLI (`vercel build`, then `vercel deploy --prebuilt`), with a Vercel token stored in GitHub secrets.
- **Not tested, and still your call:** Hobby's terms on commercial use.
- The test workflow `hobby-check.yml` and the `hobby-check/bot` branch are removed with this write-up.
