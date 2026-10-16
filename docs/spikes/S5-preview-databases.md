# Spike 5: preview databases

Status: **built, live tests pending** (needs A8). Results are filled in below as each test runs.

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

## Live tests

| # | Test | Result |
| --- | --- | --- |
| 1 | Push this branch with a PR open: Neon branch `preview/stage0/spike-5` exists, build log says "migrating (preview branch ep-…)", preview `/api/health` says `database: "branch"` | Pending |
| 2 | Throwaway migration on the branch applies there and not on production (reverted before merge) | Pending |
| 3 | First push of a brand-new git branch gets its variables on the first build | Pending |
| 4 | Closing a throwaway PR deletes its Neon branch; deleting a branch with no PR does too | Pending |
| 5 | At the 10-branch limit, a new preview fails or falls back, and never migrates production | Pending |
| 6 | CU-hours used during the spike | Pending |

## Decision

Pending the live tests.
