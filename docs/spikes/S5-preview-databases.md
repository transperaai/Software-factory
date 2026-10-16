# Spike 5: preview databases

Status: **tests 1, 2, 3, 4 and 6 passed**; test 5 (branch limit) waits on Austin's go-ahead.

## Question

Can each PR's preview get its own Neon database branch, migrated by its build, and have that branch removed when the PR closes, without anyone touching either?

## What the docs say (checked 16 Oct 2026)

- We use the Vercel-managed Neon integration (A2). Turning on **Preview** under Deployments Configuration makes one Neon branch per git branch, named `preview/<git branch>`. Every pushed branch gets one, PR or not. [Neon: preview branches](https://neon.com/docs/guides/vercel-native-integration-previews)
- The branch's `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `PG*` values are injected per deployment and override the static Preview variables. With "Resource must be active before deployment" on, the build waits for the branch, so the build can migrate it. [Vercel: deployment integration actions](https://vercel.com/docs/integrations/create-integration/deployment-integration-action)
- Branches are only deleted when Vercel removes the deployments: about 30 days on Hobby, plus up to 48 hours. Not on PR close. [Neon: branch cleanup](https://neon.com/docs/guides/vercel-branch-cleanup), [Vercel: retention](https://vercel.com/docs/deployment-retention)
- Neon Free: 10 branches per project (production counts, so 9 previews), 100 CU-hours a month shared by every branch including production, 1 GB storage. Branches copy production data. [Neon: plans](https://neon.com/docs/introduction/plans)
- Not documented: what a preview does if its branch can't be created (limit reached, Neon down). It may fall back to the static Preview variables, which point at production.

## What we built

- **Migration guard** (`packages/db/scripts/migrate-guard.mjs`). Production builds migrate production. A preview build migrates only when its database endpoint differs from production's (`FACTORY_PROD_DB_ENDPOINT`, not a secret). If a preview is connected to production, the build fails, so it never ships. If it can't tell, it skips.
- **`/api/health`** reports `database: production | branch | unknown`, without the host.
- **Cleanup** (`.github/workflows/neon-preview-cleanup.yml`). When a PR closes or a branch is deleted, the workflow deletes `preview/<branch>` through Neon's API. It runs from `main` only, the key lives in a GitHub environment limited to `main`, and it never deletes a name outside `preview/` or the default branch. We call Neon's API directly rather than `neondatabase/delete-branch-action`, because its docs don't say what happens when the branch is already gone, and merge-then-delete fires both events.

## Found on the way: migrations skipped by the build cache

The first live run showed `cache hit, replaying logs`: Vercel's Turbo remote cache replayed an older build, so the migration step inside it never ran. A production build whose code matched an earlier preview could skip its migration the same way. Fixed in #14: Vercel's build command runs the migration first, outside Turbo, on every deploy. Production's next build logged `migrate: up to date`.

## Live tests

| # | Test | Result |
| --- | --- | --- |
| 1 | Push this branch with a PR open: Neon branch `preview/stage0/spike-5` exists, build log says "migrating (preview branch ep-…)", preview `/api/health` says `database: "branch"` | **Pass** (16 Oct, `852ee35`). Branch exists; log: `migrating (preview branch ep-tiny-flower-a7fh6i5q)`, `up to date`; health `database: "branch"` |
| 2 | Throwaway migration on the branch applies there and not on production (reverted before merge) | **Pass** (16 Oct, `19364fc`, reverted). `spike5_probe` on `preview/stage0/spike-5`, not on `main` |
| 3 | First push of a brand-new git branch gets its variables on the first build | **Pass** (16 Oct, `spike5/first-build`, `a5697b4`). First build logged `migrating (preview branch ep-frosty-hat-a7uqxfs4)`, `up to date`; the Turbo cache hit came after the migration, as #14 intended |
| 4 | Closing a throwaway PR deletes its Neon branch; deleting a branch with no PR does too | **Pass** (16 Oct). Closing #13 deleted `preview/stage0/spike-5` in about 1 s; the auto-delete of its git branch then found nothing and passed. Closing throwaway #16 deleted `preview/spike5/cleanup-test` |
| 5 | At the 10-branch limit, a new preview fails or falls back, and never migrates production | Pending |
| 6 | CU-hours used during the spike | **0.39 CU-hours** for the whole project this period (limit 100). Each preview branch used about 80 s of compute |

## Decision

**Adopt.** Every preview gets its own migrated Neon branch with no one touching it, production is never migrated by a preview, and closing a PR removes its branch within seconds. Cost is negligible at our scale.

Also learned:

- Neon marks the production branch undeletable ("vercel production branch"), a second safety net under the cleanup's `preview/` filter.
- Branches from PRs merged before the cleanup existed (`preview/stage0/migrate-uncached`) stay until Vercel's retention removes them, or until they are deleted by hand.
- Test 5 (what happens at the 10-branch limit) is still open. The guard means a fallback can't migrate production, but a fallback preview would talk to production at runtime.
