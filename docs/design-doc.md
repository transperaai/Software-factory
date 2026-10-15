# ADLC Software Factory — Design Doc

Oct 14, 2026 · @Austin Smith

The factory turns messy client input into traced, tested software: agents draft and build, a human approves every decision, and every artefact is either approved, living, generated, kit or culled. This doc records every decision made so far, before anything is built.

## Principles

Ten rules govern every phase. When a later design choice conflicts with one, the rule wins or gets changed here first.

1. **No vibed requirements.** Every requirement traces to a named person and a source. Unbacked asks are parked, visibly.
2. **Humans approve decisions; agents do the writing.** You read and approve only what a person must own: problem, value, rules, scope, design, acceptance, risk.
3. **One fact, one place.** Every fact lives once, as a record with an ID in git. Everything else is a generated view of it.
4. **Traceability is a build check, not a spreadsheet.** Broken links fail CI and appear on your attention list.
5. **Tracer bullet first, vertical slices after.** The first slice touches every layer end to end; every later slice is thin and shippable.
6. **Small batches, WIP limit of 2.** Agents may build the next review unit (a slice or a batch of slices) while the current one awaits acceptance, never two ahead. This prevents the QA mountain.
7. **Independent review.** Reviewer, security and test agents judge the work against the spec without seeing the builder's reasoning, and may run on a different model.
8. **Keep the BA technique, cull the document shell.** Template guidance becomes agent instructions; version tables, sign-off tables and headers are replaced by git history and approval records.
9. **Harness-agnostic.** Agents are plain specs in the repo, so any model or runner can play a role.
10. **The factory learns.** Lessons from every project are proposed back into the kit, with your approval and without client data.

## Profiles and modes

Every project picks one profile and one mode at setup. Together they decide which artefacts, approvals and agents switch on, so process scales with the job.

| Profile | For | What it adds or removes |
| --- | --- | --- |
| Lite | Internal tools, small automations for yourself | One-page Brief, glossary, prototype, slices. No client gates, no readiness or comms pack. |
| Client | Delivery for a paying client | Everything: claim ledger, full Brief, client approvers at Discovery, prototype and UAT gates, readiness and training. |
| SaaS | Your own products | Long-lived brand and design system, persistent backlog and roadmap, KPI dashboard always on. |
| Headless | Automations and integrations with no UI | Flow diagrams and sample payloads replace the design board and prototype; use cases matter most here. |

| Mode | Meaning | Effect |
| --- | --- | --- |
| Handover | You build it, then hand it to the client | Ends with a handover pack: runbook, access sheet, feature docs, knowledge base. Maintenance agents stop at handover. |
| Operate | You keep running it (SaaS, retainers) | Maintenance agents stay on: monitoring intake, reactive and proactive loops, quarterly health and KPI reviews. |

Each artefact in the verdict tables is tagged with the profiles that need it. The design board is per project, seeded from a client-level default.

## Where the truth lives

Git is the record; everything else reads from it. Approval means a merged change, so nothing is ever approved off the record.

| Layer | What it is | Job |
| --- | --- | --- |
| Git (GitHub) | Markdown files with frontmatter IDs and links | The source of truth and the audit trail |
| GitHub Issues + Projects | One issue per slice, defect, debt item | The work queue |
| Pull requests | Artefact or code changes | The gates: approve = merge |
| GitHub Actions | CI jobs | Trace checks, projections, security and test agents |
| Index (Postgres on Neon, through the Vercel Marketplace) | IDs, links, statuses, agent events, synced on every push | Fast queries for the dashboard and agents |
| Dashboard (Next.js on Vercel) | Your cockpit, no tool limits | Kanban, attention queue, thread explorer, UAT, approvals |
| MCP server | Agent interface to the index | Any harness can ask "what does RULE-01 say?" |

**Deploy adapters.** Environments are defined platform-neutrally: a preview per slice with a clickable URL, staging and production, each with secrets, migrations, rollback and backups. Each platform gets an adapter; Vercel is first, others (Netlify, Railway, Fly, AWS, Azure, client servers) are added when a project needs them. The choice per project is an ADR.

**Kit distribution (agreed 15 Oct).** This repo (Software-factory) is the master copy of the kit: agents, skills, hooks and scripts, released as tagged versions. Each project repo installs the kit at a pinned version, recorded in a lockfile (version and file hashes), so the project runs on its own with no access to the factory repo and survives handover. A kit update arrives as one pull request per project, with the project's tests and the kit's evals run first, and is merged only with your approval. Stage 0 spike 1 proves the mechanism on `factory-test-project`.

**Approval records** always store who, role, when and which version, so client approvers can be added later without retrofitting. No vector database for now: trace links are structured; add search later if needed.

## How artefacts are handled

Everything appears on the dashboard with version history and revert. The label only says who writes it and whether work waits on you.

| Label | Who writes it | Your role |
| --- | --- | --- |
| Approve | An agent drafts | You review, edit and approve; downstream work waits |
| Living | Agents keep it current as work happens | View or edit any time; nothing waits |
| Generated | Computed from code, CI or other records | You see it; to change it, edit its sources |
| Kit | Written once in the factory template | Reused by every project; projects record only deviations |
| Culled | Nobody | Doesn't exist; something else covers it |

Every template splits three ways: the **technique** (kept, becomes agent instructions), the **data** (kept, becomes records and views) and the **document shell** (culled; git and approval records replace it).

## Ingestion and attribution

Any input goes in; only attributed, evidenced claims come out as requirements. You still run the kickoff, interviews, shadowing and 5 Whys; the factory does the write-up.

1. **Sources inbox.** Transcripts, typed notes, emails, rough documents, screenshots, spreadsheets. Each is stored untouched with a SRC- ID.
2. **Claim extraction.** The agent pulls out claims, rules, terms and pains, each linked to its exact place in the source.
3. **Attribution.** Every claim gets a speaker or author, matched to the stakeholder register by name, nickname, email or role.
4. **Confirmation.** You confirm before anything becomes evidence.
5. **Brief assembly.** The Brief is built only from confirmed, attributed claims. Weak claims generate follow-up questions for the next session.

| Source type | Claim trust |
| --- | --- |
| Recorded transcript | Verbatim quote, strong |
| Typed notes | Your paraphrase, medium |
| Rough document or forwarded email | Unverified until confirmed |

**Attribution rules**

- Unknown speaker → an attention card: add as new stakeholder, merge with an existing one, or ignore. Required at add: name, role, organisation. Scoring fields come later as a nudge.
- Unlabelled speaker ("Speaker 2") or unclear author → always needs your confirmation; the agent proposes a best guess.
- People mentioned but not present ("our finance director signs off") → a possible-stakeholder card.
- Documents with no author → recorded as "supplied by", not "said by".
- You are a stakeholder (delivery lead), so your assumptions are marked as yours.
- Unattributed claims are held as pending and cannot support a BR. Extraction never waits; only evidence use does. A new stakeholder flagged as an approver blocks the gate they approve until confirmed.
- Conflicts between stakeholders are flagged as open questions; the resolution is logged in 3.7.

## Traceability

Every item sits on one thread from a person to production, walkable in both directions on the dashboard. A broken link shows red and appears on your attention list.

**The thread:** Stakeholder (SH-) → Source (SRC-) → Claim → Pain (PP-) / KPI → Business requirement (BR-) → Use case (UC-) → Story + ACs (US-) → Functional requirement (FR-) → Rule (RULE-) / NFR → Slice (SL-) → PR → Test (TC-) → UAT (UAT-) → Release (REL-) → Issue (ISS-) after go-live.

**Decisions made**

- **FR- layer stays.** Stories are user-centred and FRs system-centred; one FR can serve several stories. Drift protection: the agent drafts FRs from linked ACs, and a changed story flags its FRs as "needs review".
- **Use cases stay** (Approve). They find alternate and exception paths and add the BR → UC → story link.
- **As-Is process only when replacing something that exists**; the gap analysis follows the same rule.

**Automatic checks on every merge**

- Forward: every BR has a story; every FR has a passing test; every Must story has a UAT script.
- Backward: every PR traces to a story; code with no story is a scope-creep alarm.
- Design: every RULE has an implementing place and a test; every entity has an owner and a data class; every threat has a control; every tech choice has an ADR (this replaces the A.7 design review meeting).
- ID conventions are enforced in issue titles, branch names and PR descriptions.

## Approval points

Routine approvals follow the delivery flow; exception approvals appear only when something is off. Production deploys always need your approval, including hotfixes.

| When | What you approve | Type |
| --- | --- | --- |
| Discovery | The Brief (vision, scope, root cause, value, BRs) | Routine |
| Analysis | To-Be process; use cases | Routine |
| Design | Design board; prototype | Routine |
| Requirements | Stories + ACs with the slice plan; backlog order and release horizons | Routine |
| Architecture | ADRs for hard-to-reverse choices; residual security risk | Routine |
| Build | Each slice (slice card + preview) | Routine |
| Release | Test exit and waivers; Go decision; UAT sign-off (client approvers in Client profile) | Routine |
| Release | Comms before sending; hypercare exit; post-implementation actions | Routine, Client profile |
| Operate | Alerts and thresholds; maintenance plan quarterly | Routine, Operate mode |
| Any time | Destructive migrations and production data fixes; masked production data for testing | Exception |
| Any time | Defect deferrals; NFR near misses; Sev-1/2 confirmation; access changes | Exception |
| Any time | Change requests; kit changes proposed by the learning loop | Exception |
| Urgent | Sev-1 and Sec-Critical deploys via phone notification, one-tap approve | Exception |

The change advisory board (R.2) is off by default and switched on only when a client requires it.

## Verdicts: Analysis pack

31 templates. The Brief and five other approval points survive; most of the rest become living records or generated views, and only A.4 and A.7 are culled.

| Template | Verdict | Becomes |
| --- | --- | --- |
| 1.1 Vision & Scope | Approve | First state of the Brief, stamped "draft, not confirmed scope". Assumptions and open questions tracked. |
| 1.2 BRD | Approve | Confirmed state of the Brief. BR register with evidence column and parked list. A BR with no PP- or root-cause link cannot be approved. |
| 1.3 Problem & root cause | Approve | Folded into the Brief. 5 Whys with required evidence; fishbone. Lite: one-line problem statement. |
| 1.4 Pain point log | Living | PP- trace roots; baseline frozen at approval. Client and SaaS. |
| 1.5 KPI framework | Living | Becomes the live scorecard after go-live. All but Lite. |
| 1.6 Stakeholders + interaction log | Living | The business brain; fills itself from attributed sources. |
| 1.7 Personas | Living | Evidence-backed cards. |
| 1.8 Glossary | Living | CI warns when code names drift from terms. |
| 2.1 Process model | Approve | To-Be in Mermaid; As-Is only when replacing. Pain coverage check is generated. |
| 2.2 Context diagram | Generated | Drawn from the interface register; boundary decisions go to 3.7. |
| 2.3 Use cases | Approve | Alternate and exception flows; parent of stories. Approved with stories. |
| 2.4 Gap analysis | Generated | From As-Is vs To-Be steps, plus a people-and-data section you fill. Only when As-Is exists. |
| 2.5 CRUD matrix | Living | Every conditional cell gets a negative test; matrix coloured by test status. |
| 2.6 State machine | Living | Every transition gets a test; diagram shows which are proven. |
| 3.1 Stories + ACs | Approve | Derived from the approved prototype; closed, not edited, once accepted. |
| 3.2 SRS | Generated | Compiled from stories, FRs, rules, NFRs, data. Click a line to edit its source record. Also the agents' context pack. |
| 3.3 NFRs & SLAs | Living | Profile defaults from the kit; each "verified by" is a CI check with live results. |
| 3.4 Data dictionary | Living | Merged with A.3 and all data classification. People own meaning, owner, rule, PII; types and ERD generated from schema. |
| 3.5 Interfaces | Living | Sample payloads become contract tests. |
| 3.6 Wireframes & prototype | Approve | Adds the design board; WF- screen inventory and persona test log kept. |
| 3.7 Decisions + rules | Living | Append-only; impact column required; also the change-control log. |
| 3.8 Traceability | Generated | The thread explorer; audits run on every merge. |
| A.1 Solution architecture | Generated | Component map from code; options move into ADRs. |
| A.2 ADRs + index | Approve | Markdown ADRs for hard-to-reverse choices; index is a view. One series with D.4. |
| A.3 Data model & ERD | Merged | Into 3.4. |
| A.4 Detailed design | Culled | Lives in code, OpenAPI and the agent-maintained guide. Its "every rule implemented" check becomes a trace check. |
| A.5 Threat model + register | Living + Approve | Security agent maintains it; status updates from tests. You approve residual risk only. |
| A.6 Environments | Kit | Deploy adapter defaults; projects record deviations. Restore tests become scheduled jobs. |
| A.7 Design review | Culled | Its checklist becomes automated CI checks; findings become issues. |

## Verdicts: Development & QA pack

25 templates. Most logs now write themselves from GitHub and CI; sprints are the only cull, replaced by a continuous slice queue.

| Template | Verdict | Becomes |
| --- | --- | --- |
| D.1 Definition of Ready & Done | Kit | Automated gates before a slice starts and before it reaches you. |
| D.2 Engineering standards | Kit | One set per stack, enforced by linters, PR template and branch rules. |
| D.3 Sprint plan | Culled | Slice queue with WIP limit; tasks become each slice's agent plan file. Weekly report is phase 2. |
| D.4 Spike & design note | Living | Time-boxed spikes attached to slices; ADR half merges into A.2. |
| D.5 PR & review log | Generated | From GitHub; blocking themes feed the learning loop. |
| D.6 Build & pipeline log | Generated | From CI; "what's deployed where" view. |
| D.7 Developer guide | Living | Agent-maintained in the repo; gotchas log is the agents' shared memory. |
| D.8 Review & retro | Split | Review = slice acceptance record; metrics generated; retro = learning loop. |
| D.9 API register + OpenAPI | Generated | From the OpenAPI file. |
| D.10 DB change log | Generated + Approve | From migration files; destructive migrations and production data fixes need approval. |
| D.11 Security review + findings | Living + Approve | Qualifying slices (auth, permissions, rules, personal data, new interface, upload) trigger a threat model; checklist automated; residual risk approved. |
| D.12 System & feature docs | Generated | Plain-language feature pages from as-built behaviour; reviewed with the release. |
| D.13 Backlog & roadmap | Living + Approve | The kanban; you approve order and horizons; Ready flag automatic; MoSCoW kept. |
| T.1 Test strategy | Kit | Per profile: levels, severity scale, exit criteria as an automated gate. |
| T.2 Test cases | Generated | From ACs, rules, CRUD cells, transitions; readable register; reviewed by a different agent. |
| T.3 Test data & environments | Kit + Generated | Seeds as code; one account per persona; stubs from payloads; masked production data needs approval. |
| T.4 Execution log | Generated | From CI plus your manual results; exploratory charters run by the QA agent. |
| T.5 Defect log | Living + Approve | GitHub issues, same columns as 6.1; deferrals need approval; root cause required to close. |
| T.6 Regression pack | Generated | From tagged tests; flaky tests auto-quarantined with a fix issue. |
| T.7 Non-functional report | Generated + Approve | From CI performance, security, accessibility and browser jobs; near misses approved. |
| T.8 Test summary & exit | Generated + Approve | Assembled from T.4–T.7; exit decision and waivers approved. |
| T.9 UAT | Living + Approve | Factory-generated plain-English scripts in the dashboard; sign-off by registered approvers. Built from scratch, not from existing skills. |

## Verdicts: Release pack

9 templates. Modern hosting deploys without downtime and rolls back in one click, so ceremony shrinks; rigour stays on database changes, because data loss cannot be rolled back.

| Template | Verdict | Becomes |
| --- | --- | --- |
| R.1 Release plan | Generated + Approve | Scope, descoped and dependencies from the trace; window rules from the adapter. |
| R.2 Change advisory board | Culled | On only when a client requires it; conditions move to R.4. |
| R.3 Runbook & rollback | Kit | Per deploy adapter; project steps only for migrations; automated rehearsal on staging; point of no return flagged for destructive migrations. |
| R.4 Go-live checklist | Generated + Approve | Items check themselves from evidence; you approve waivers and the Go decision. |
| R.5 Deployment record & smoke | Generated | QA agent runs smoke checks on production with screenshots; failure triggers a rollback proposal. |
| R.6 Training & comms | Generated + Approve | Notice, support brief, stakeholder note, guides from feature docs and videos. Client profile. |
| R.7 Hypercare log | Living | Same issue pipeline as 6.1; daily summary from monitoring; exit rule checked automatically, exit approved. |
| R.8 Post-implementation review | Generated + Approve | Planned vs actual, first KPI reading, stability; actions approved and fed to the learning loop. |
| R.9 Business change & readiness | Approve | Client profile only. ADKAR scoring is yours; SOPs generated; KPI reviews scheduled. |

## Verdicts: Maintenance pack

16 templates, already written with agents in mind: reactive loop R1–R10, proactive loop P1–P7, and agent access rows. Most apply only in Operate mode.

| Template | Verdict | Becomes |
| --- | --- | --- |
| 5.1 Service & support model | Kit + Approve | Defaults from the kit; severity targets and escalation names approved per project. Security fast path hard-wired. One severity scale. |
| 5.2 Runbook | Living | Agent-maintained; generic procedures from the adapter; quarterly procedure test scheduled. |
| 5.3 Monitoring & alerting | Living + Approve | Every promise with a number gets an alert; agent proposes, you approve. Observability tools plug in here. |
| 5.4 Release notes | Generated | Per deploy, technical and plain-English. |
| 5.5 Environment & access | Generated + Approve | The factory's permission model; access changes approved; doubles as the handover export. |
| 6.1 Issue log | Living | Reactive loop record, fed by monitoring, feedback button and client reports; Sev-1/2 need your confirmation. |
| 6.2 Change request log | Living + Approve | Requests must serve a BR or PP; decisions are yours or the client's. |
| 6.3 Incident postmortem | Generated + Approve | Timeline from alerts, issues and deploys; blameless; Sev-1/2 only. |
| 7.1 Technical debt | Living | Fed by scans, reviews, hotspots, postmortems; scored by formula. |
| 7.2 Dependency & EOL | Generated | From lockfiles and scanners, plus manual cert, licence and cost rows; risky ones promoted to 7.1. |
| 7.3 Health scorecard | Generated | 8–12 trend lines a non-engineer can read. |
| 7.4 Maintenance plan & budget | Approve | Quarterly, SaaS and retainers. Capacity = agent effort and cost plus your review time; preventive never borrowed for reactive. |
| 7.5 Data maintenance | Living | Quality checks and restore rehearsals as scheduled jobs. |
| 8.1 Knowledge base | Generated | From feature docs and repeated questions; re-verified each release. |
| 8.2 KPI & benefits | Generated | Live KPIs against the frozen Discovery baseline; the proof of value. |
| 8.3 Retirement plan | Approve | Rare; drafted from interfaces, data and dependencies. |

**Across all four packs:** 81 templates. Duplicates merged: data classification (3.4, A.5, D.11 → data dictionary), ADRs (A.2, D.4 → one series), severity scale (T.1, 5.1 → kit).

## Testing for humans

Agents do the exhaustive testing; you judge whether it is right. The factory generates three things so testing never feels like a mountain.

**1. Slice card, per slice**

- What changed, in plain English
- Preview link to the running app
- Walkthrough video recorded by the QA agent
- "Try this": 3–5 steps with the test login pre-filled
- What agents already proved (e.g. 14 checks: 6 acceptance, 5 permission, 3 edge-case)
- What it deliberately does not do yet

**2. UAT checklists, in the dashboard**

- Plain-English steps with "you should see…", grouped by persona and flow
- Each step opens the app at the right screen, logged in as the right test user, with data loaded
- Pass / Fail / Comment buttons; a failure becomes a defect with build, step and screenshot attached

**3. Feedback button, preview and staging only**

- Click, mark up the screenshot, type what's wrong; page, build, console errors and user captured automatically
- An agent sorts it: bug → defect; change request → change control for your approval; question → answered from feature docs

| Agents test | You test |
| --- | --- |
| Every AC, clicked through in a browser | Does it solve the actual problem? |
| Every permission condition and negative path | Does it feel right to use? |
| Every rule and state transition | A "real day" of use |
| Exploratory charters on every preview, with recordings | The UAT checklist |
| Regression, performance, security, accessibility, browsers |  |

## Learning loop

The factory learns at two tiers, and only general, client-free lessons cross projects, always with your approval.

| Tier | Holds | Lives in |
| --- | --- | --- |
| Project memory | Client-specific lessons: glossary quirks, their systems' gotchas | The project repo |
| Factory memory | General lessons that improve every project | The factory kit |

**Inputs:** retro patterns, PR blocking themes, defect root causes, postmortem actions, post-implementation findings, alert noise.

**How a lesson moves up**

1. The learning agent spots a pattern (e.g. business-hours SLA bugs twice).
2. It tags the lesson project-specific or general.
3. General lessons are stripped of client names, data and business specifics.
4. You approve or reject the proposed kit change.
5. Every new project starts with it.

**Worth sharing:** checklist items, gotchas per stack, agent instruction improvements, common rule patterns with edge cases, NFR and threat defaults, reusable components and test patterns.

**Measured:** escaped defects, rework and review findings by theme across projects show whether a lesson helps; lessons that don't are retired.

**Self-improving skills.** Every agent's skill is a versioned file in the kit, so the learning loop can propose edits to it, gated by evals and your approval.

| Step | What happens |
| --- | --- |
| Signals | Your edits to agent drafts (the strongest signal: draft vs approved), review rejections, rework per slice, defect root causes, token use |
| Proposal | The learning agent drafts one skill change at a time, with the evidence behind it |
| Eval | The change runs against that skill's eval set (golden cases from past projects, client details stripped, plus held-out cases) |
| Gate | Shown to you only if quality improves or holds and tokens drop or hold; no regressions |
| Approve | You approve; the new version ships to all projects |
| Watch | Live metrics compared with the old version; one-click rollback |

No skill changes itself without your approval. Anthropic's skill-creator (eval and benchmark tooling) and Matt Pocock's retro skill are the starting points.

## Maintenance and observability

In Operate mode, two loops run continuously. You touch the reactive loop at three points: confirming severity, checking the fix, approving the deploy.

**Reactive loop (things break)**

1. Signal: alert, feedback button, client report or email
2. Intake: dedupe and log
3. Triage: severity by business impact — **you confirm Sev-1/2**
4. Analyse: root cause and trace to the story and code
5. Fix PR: starts with a failing test that reproduces the bug
6. Review: other agents, independently
7. Verify: **you check the preview**
8. Deploy: **you approve**
9. Production check: smoke tests and metrics
10. Close: with a lesson for the learning loop

**Proactive loop (scheduled jobs)**

| Cadence | Jobs |
| --- | --- |
| Daily | Data quality checks |
| Weekly | Dependency and CVE scan; flaky test review; alert noise review |
| Monthly | Debt and dependency re-score; vendor release notes; cost and seat check |
| Quarterly | Restore rehearsal; runbook procedure test; health scorecard and KPI review; maintenance plan draft for approval |

**Security fast path:** an exploitable critical or high CVE, or an exposed secret, skips the queue. Confirm exposure within 15 minutes, rotate secrets first, patch within 48 hours, and reach you as an urgent one-tap approval.

**Observability inputs:** error tracking (e.g. Sentry), uptime monitoring, logs, GitHub Dependabot and code scanning, performance and usage analytics. Agents get read access plus the ability to open issues, never admin access to these tools.

In Handover mode, the loops stop at handover; the client receives the runbook, access sheet, alert spec, feature docs and knowledge base.

## Agents

An agent is a written job description plus permissions. Claude drafts every spec from your templates; you review each one. You do not need to write prompts yourself.

**The six-part spec**

| Part | Meaning | Security agent example |
| --- | --- | --- |
| Role | Who it is and how it thinks (the system prompt) | "Assume code is unsafe until proven otherwise…" built from template guidance and kit lessons |
| Triggers | What wakes it | Every PR; nightly scan; vendor advisory |
| Reads | What it may see | Diff, threat register, data dictionary — not the builder's reasoning |
| Tools & permissions | What it may do | Run scanners, comment, block merge, open fix PR; never merge, never touch production secrets |
| Writes | Records it updates | SEC- findings, threat register status |
| Escalation | When it stops and asks you | Residual risk; any Sec-Critical finding |

**How one spec serves every project type.** Each agent is assembled from layers, so you never maintain separate prompts per project type:

1. **Base spec** — the job, same everywhere
2. **Profile overlay** — how strict, for Lite, Client, SaaS or Headless
3. **Mode overlay** — extra duties in Operate mode
4. **Project context** — glossary, rules, ADRs, read through the agent interface
5. **Kit lessons** — what the factory has learned

| Security agent | Lite | Client | SaaS | Headless |
| --- | --- | --- | --- | --- |
| Scanners on every PR | Yes | Yes | Yes | Yes |
| Threat model trigger | Auth or personal data only | Every qualifying slice | Every qualifying slice | Every new interface or credential |
| Data classification | Basic PII flag | Per client regulation | Per your privacy policy | Payload fields |
| Pen-test style probing of preview | No | Before release | Each major release | API fuzzing |
| Operate mode adds | — | Weekly CVE scan, fast path | Weekly CVE scan, fast path | Weekly CVE scan, fast path |

**Draft roster** (each gets a six-part spec at step 3)

| Area | Agents |
| --- | --- |
| Discovery | Ingestion and attribution agent; BA agent (Brief, root cause, BRs, process, use cases) |
| Design | Designer (design board, prototype); UX and accessibility reviewer |
| Requirements | Story and slice agent (stories, ACs, FRs, slice plan) |
| Architecture | Architect (ADRs, adapter choice) |
| Build | Coder |
| Review | Code reviewer; security agent |
| Test | Test author; QA explorer (browser); smoke tester |
| Glue | Conductor (queue, WIP limit, routing); trace keeper (checks and projections); docs writer (feature docs, release notes, knowledge base, comms) |
| Operate | Triage agent; proactive maintenance agent; monitoring intake |
| Learning | Learning agent (lesson proposals) |

Reviewer agents may run on a different model from the coder for more independent review.

## Dashboard

One Vercel dashboard across all projects, designed in detail after the phase deep-dives. These first views fall out of the decisions above.

| View | Shows |
| --- | --- |
| Needs my attention | Approvals waiting, confirmations (speakers, stakeholders, Sev-1/2), broken trace links, exception approvals |
| Kanban | Slices by stage with the WIP limit; backlog order and release horizons |
| Testing queue | Slice cards to accept; UAT checklists with Pass / Fail / Comment |
| Thread explorer | A drill-down table: business requirements, then a requirement's stories (with where it came from), then everything a story turned into (rule, spec, slice, code, tests, UAT, release). Breadcrumb to go back up; gaps shown in orange; exportable as a traceability matrix |
| Project pages | Brief, BR register, pain log, stakeholders and interaction log, glossary, personas, rules and decisions, CRUD matrix, state machine, data dictionary, interfaces, NFRs, threats |
| Sources inbox | Ingested sources, extracted claims, trust levels, pending attribution |
| Agent feed | Live plan files and agent activity; interrupt any time |
| Health (Operate) | Scorecard, KPIs vs baseline, open issues, alerts |
| Factory | Kit, lessons proposed and adopted, cross-project metrics; test accounts (per project and environment: one login per persona and role, the smoke account for production, which test data is loaded; passwords stored encrypted in Postgres (no vault for now) and revealed or copied on click, never stored in the repo; reset and reseed buttons; client UAT tester accounts in phase 2); design library (browse components, palettes, type and kits from approved sources, live in your kit, with licence, Add to kit, Copy code, and generate new); integrations (factory-wide, reviewed weekly: this week's digest of third-party API changes as the focal point, then one row per provider with projects using it, pinned versus latest version, next sunset deadline, health, credential expiry and open change requests) |

Every record page has a history tab with diffs and revert. Client logins come later; approval records already carry approver and role.

## Phase 1: Discovery (locked 14 Oct)

Discovery runs in rounds until the Brief has enough evidence, and every record must meet a minimum standard before it counts. Documentation without substance is blocked, not just discouraged.

**Flow**

1. Project setup: dashboard form for client, profile, mode, approvers, design kit (from the client default)
2. Sources into the inbox
3. Extraction and attribution
4. Your confirmations (speakers, new people, conflicts)
5. Session prep: next-meeting questions, ordered by which unconfirmed claims block a BR; drafted by the BA agent, and you can add, edit or reorder your own questions
6. Repeat 2–5 until the Brief meets its minimums
7. Brief drafted
8. Approval (plus client in the Client profile)

**Decisions**

- Client questionnaires go through you. Direct-to-client forms are phase 2, with multi-user.
- Evidence and baselines are not hard blocks for drafting: the Brief shows a risk flag on any Must BR without confirmed evidence and any KPI without a baseline.
- The design kit selection needs a prototype before it is locked.

**Minimum information standard.** Every record has required fields and quality checks. A record is Complete, Thin (fields present but failing a check, shown as a risk) or Missing (required field absent, blocks the gate). Lite requires a subset.

| Record | Required | Quality checks |
| --- | --- | --- |
| Source (SRC-) | Type, date, participants, raw file | Every participant attributed or confirmed |
| Claim | Words, speaker, source location, type (fact, opinion, ask, assumption) | Unconfirmed claims cannot be evidence |
| Stakeholder (SH-) | Name, role, organisation | Approvers flagged before their gate |
| Pain (PP-) | Who feels it, measure, baseline, method, sample, workaround | Baseline is a number with a method, not an anecdote |
| Business requirement (BR-) | Statement, evidence link, value, MoSCoW priority, owner | Outcome not solution (words like "dashboard", "button", "kanban" flagged); evidence confirmed |
| KPI | Type (leading/lagging pair), baseline, target, method, owner, review date | Clock start and stop defined for time measures; must be measurable by the new system |
| Root cause | Measurable problem statement, 5 Whys | Every why cites evidence; root cause is not "people are slow" |
| Persona | Jobs, pains, constraints, design implications | At least 2 evidence claims from different sources |
| Glossary term | Definition, owner, not-to-be-confused-with, system field? | Time terms define start and stop |
| Vision and scope | Vision sentence, in/out lists, assumptions with owners, constraints | Outcomes not features; every assumption has a validation owner |

**Checks across all records:** vague words ("fast", "easy", "user-friendly", "intuitive") flagged and replaced with numbers; duplicates detected; contradictions between stakeholders raised as open questions.

**Discovery screens (prototyped 14 Oct)**

| Screen | Flow steps | Artefacts it writes or satisfies |
| --- | --- | --- |
| Inbox | 2 Sources in, 3 Extraction | Sources (SRC-); claims ledger; 1.6 interaction log entries |
| Review | 3 Attribution, 4 Confirmations | 1.6 stakeholder register; claims ledger; 3.7 decisions (conflicts resolved as DEC-); 1.8 glossary (agreed definitions) |
| Session prep | 5 Next-session questions | Closes Thin items in 1.3, 1.4, 1.5 and assumptions in 1.1 |
| Brief | 7 Draft, 8 Approval | 1.1 vision and scope, 1.2 BRD (BR register, value, parked), 1.3 root cause, plus summaries of 1.4, 1.5, 1.6 |
| Artefact sidebar | All | Live Complete / Thin / Missing status of every Discovery record (1.4, 1.5, 1.6, 1.7, 1.8, 3.7) |

**Brief structure (approved)**

1. Summary (generated: trigger, problem, outcome)
2. Vision and scope (1.1): vision, in/out, assumptions to validate
3. Problem and root cause (1.3): measurable problem, 5 Whys, root cause
4. Current state (1.4): pain points with baselines
5. Business requirements (1.2): ID, outcome, evidence, priority, value, owner, status
6. Value (1.2): time and money, baseline to expected
7. Success measures (1.5): KPIs with baseline and target
8. Stakeholders and approvers (1.6)
9. Parked asks (1.2): with reasons
10. Open questions and risks (generated from Thin items)
11. Approval record: who, role, date, version, accepted risks

**Prototype fidelity (decided 14 Oct).** Phase prototypes test flow, content and logic only. Visual design happens once, in the dashboard design step, across all phases together. Feedback already captured for that pass: the first Discovery prototype was too busy with no focal point. Principle: every screen leads with one thing, the next decision only you can make; everything else is secondary and quiet.

**Design kit structure.** A kit works like a Figma design system, stored as design tokens (the W3C standard format) in the repo and rendered as a living style guide on the dashboard.

| Kit layer | Contents |
| --- | --- |
| Colour | Scales 50–900 for neutrals, primary, secondary; semantic error, success, warning, info; "on" colours for text; contrast checked to WCAG AA |
| Type | Font families, typescale per heading and paragraph level (size, line height, letter spacing, weight), mobile and desktop |
| Shape and space | Spacing scale, radius, borders, shadows, motion |
| Components | Buttons, inputs, selects, cards, tables, alerts, nav — each with sizes and states (default, hover, focus, disabled, error) |
| Patterns | Page layouts and blocks: forms, lists, detail pages, dashboards, empty states |

Tokens generate the app theme (Tailwind and shadcn variables), so the style guide always shows real components, not pictures. Kits inherit: a client kit sets brand, a project kit overrides what differs. Figma sync through the Figma MCP is optional, for clients who work in Figma.

**Full kit scope** (what a UI designer would include; a kit is rated Complete or Thin against it):

- Foundations: colour, type, spacing, grid and breakpoints, radius, elevation, motion, iconography, imagery style, dark mode
- Components: buttons, inputs, select, checkbox, radio, toggle, date picker, file upload, table, card, modal, drawer, toast, alert, tabs, navigation, breadcrumbs, pagination, badge, avatar, tooltip, menu, loader and skeleton, empty state, chart styling
- States for every component: default, hover, focus, active, disabled, error, loading
- Patterns: forms, list and detail, dashboard, sign-in, settings, onboarding

**Importing a ready-made kit.** Any kit you find can become a factory kit, then be customised and saved to the catalogue.

| Source | How it comes in | Fidelity |
| --- | --- | --- |
| Figma kit or community file | Figma MCP reads variables, styles and components | Tokens exact; components rebuilt on our component library to match |
| shadcn theme or registry (tweakcn, presets, paid shadcn kits) | Installed directly | Tokens and components exact |
| Token file (Tokens Studio, Style Dictionary, Tailwind config, CSS variables) | Parsed and converted | Tokens exact |
| Client's own website | Colours, fonts and spacing extracted from the live site | Close; you confirm |
| PDF brand guide or screenshots | Read by the designer agent | Approximate; you confirm |

**Import pipeline:** import → convert to factory tokens → gap report (missing scales, states or components are generated from the kit's own values and marked as generated) → contrast and accessibility check → style guide preview → your approval → saved to the catalogue with its source and licence.

**Licence rule:** every imported kit records its licence and whether client use is allowed; the factory blocks a kit on a client project if its licence doesn't allow it. A client's own brand is fine to import; another company's proprietary design system is not.

**Component sources** (checked 14 Oct 2026). A kit = tokens + approved component sources. shadcn-based libraries read the same theme variables, so any kit's tokens restyle them automatically.

| Source | Role | Licence | Notes |
| --- | --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/docs/components) | Default base | MIT | Base UI or Radix; includes charts, data table, sidebar, chat parts |
| [AI Elements](https://elements.ai-sdk.dev/components/context) | Default AI chat kit | Apache-2.0 | Built for the AI SDK; context and cost display |
| [Kibo UI](https://www.kibo-ui.com) | Add-on: Gantt, kanban, editor, dropzone, marketing blocks | MIT | shadcn registry |
| [ReUI](https://reui.io/components) | Add-on: data grid, filters, kanban | MIT (Pro terms unverified) | shadcn registry |
| [Tremor](https://www.tremor.so) | Add-on: dashboards and charts | Apache-2.0 | Use the copy-paste version |
| [prompt-kit](https://www.prompt-kit.com) | Add-on: lightweight chat | MIT | shadcn registry |
| [coss ui](https://coss.com/ui) | Add-on: Base UI parts | MIT only in apps/ui and apps/origin; rest AGPL-3.0 | Copy only from the MIT folders |
| [shadcnuikit](https://shadcnuikit.com) | Paid admin templates and blocks | Commercial, client handover allowed | Team plan $199 one-time; customise each delivery; client repos private |
| [assistant-ui](https://www.assistant-ui.com/components) | Complex agent chat apps | MIT (cloud paid) | Own runtime: choose it or AI Elements per project, not both |
| [HeroUI](https://heroui.com/en/docs/react/components/time-field) | Avoid as base | MIT core | Separate design system with its own theming; clashes with shadcn tokens |
| [dqnamo.com](https://www.dqnamo.com) | Inspiration only | None stated | A studio showcase, not a library |

**Motion, fonts and theme tools** (checked 14 Oct 2026)

| Source | Role | Licence | Notes |
| --- | --- | --- | --- |
| [Geist](https://vercel.com/font) | Default typeface option | SIL OFL | Use the `geist` npm package for full glyphs |
| [Inter](https://rsms.me/inter/) | Typeface option for data-heavy apps | SIL OFL | Tabular figures for tables |
| [tweakcn](https://tweakcn.com) | Theme creation, feeds kit tokens | Apache-2.0 | Pro pricing and export details unverified |
| [NumberFlow](https://number-flow.barvian.me) | Animated numbers for KPIs, prices, counters | MIT | Respects reduced motion by default |
| [Magic UI](https://magicui.design/docs/components) | Add-on: marketing and landing polish | MIT; Pro $199 | Confirm Pro covers client handover before buying |
| [Cult UI](https://www.cult-ui.com) | Add-on: animated app and landing components | MIT; Pro terms unverified | shadcn registry, uses theme tokens |
| [React Bits](https://reactbits.dev) | Careful: hero effects, used sparingly | MIT + Commons Clause | Client sites OK; never redistribute in a resold kit or template; WebGL pieces are heavy |
| [Animata](https://animata.design) | Reference only | MIT | Quality varies; rework before production |
| [Uiverse elements](https://uiverse.io/ui-kits) | Reference only | MIT | Not tokenised; uneven accessibility |
| [Uiverse Design](https://uiverse.io/design/) | Possible kit starting points | Client-use terms unverified | Check licence before importing |
| [Vaul](https://vaul.emilkowal.ski) | Avoid as a dependency | MIT | Confirmed unmaintained since Dec 2024 |

**Motion rule:** animation libraries are for marketing pages and small moments of delight, not core workflows. Every animation respects the reduced-motion setting, and the QA agent checks it.

**Kit selection decisions (14 Oct)**

- 3–5 kits suggested per project from the Brief and personas.
- Mix and match: take colours, type, spacing, buttons, components or motion from different kits and sources into one project kit.
- Tweakable: colour, typeface, spacing, radius, density, button style, motion level (none, subtle, expressive) and the component source per category (e.g. tables from ReUI, charts from Tremor, chat from AI Elements).
- Component sources come from the approved list above, filtered by licence for the project's profile.
- The kit prototype will be updated to show mix and match, component sources and motion.

## Phase 2: Analysis (locked 14 Oct)

Analysis turns the approved Brief into how the work will flow, who does what, and which modules already cover it. Agents draft from Discovery evidence; you validate in one walkthrough workshop and approve one Analysis pack.

**Flow**

1. To-Be process drafted from the Brief and claims (Mermaid, L2; L3 on priority and risky paths). As-Is only when replacing a process, from shadowing notes.
2. Pain coverage check: every pain point maps to the To-Be step that removes it; new waits or handoffs flagged.
3. Context diagram generated from external systems mentioned; interface stubs open in 3.5.
4. Use cases drafted per actor goal; the agent hunts alternate and exception flows; rules referenced as draft RULE- records.
5. Entities and CRUD matrix drafted from use cases and roles; every conditional cell flagged for a negative test.
6. State machine for entities with a workflow; dead ends, unreachable states and clock behaviour checked.
7. Module fit-gap against the catalogue.
8. Gap analysis (only when As-Is exists): people and data gaps.
9. Walkthrough workshop: you walk the To-Be and use cases with the client; the transcript goes into the inbox and corrections flow back.
10. Approval: one Analysis pack.

**Minimum standard**

| Record | Required | Quality checks |
| --- | --- | --- |
| To-Be step | Actor, input, output, system, pain removed or marked new | No step without an actor; no pain left uncovered |
| Use case | Actor, trigger, preconditions, main flow, alternate and exception flows, postconditions, rules, linked BR | At least one exception flow; rules referenced, never restated |
| CRUD cell | Permission plus condition in plain words | Each condition has a negative test; entities nobody creates or deletes flagged |
| State | Trigger, guard, next state, system action | Every state reachable and exitable; clock pause and business hours decided |
| External system | Owner, data in and out, access method | Unknown access is a risk |
| Fit-gap row | BR or use case, module and version, coverage, gap | Gap becomes custom slices |

**Decisions**

- Client profile: the client's process owner signs off the To-Be process; you alone approve use cases and the fit-gap.
- Detail: L2 by default, L3 on priority and risky paths, L4 only on request.
- No separate Analysis prototype; its screens are designed in the dashboard design pass.

## Phase 3: Requirements (locked 14 Oct)

Requirements are prototype-led: you approve what you can click before any story is written, then stories, rules and the slice plan are derived from the approved screens. This is where ticket approval happens.

**Flow**

1. Design kit chosen: 3–5 suggestions, mix and match, your approval.
2. Clickable prototype built on the kit from the use cases (WF- screen inventory). Headless profile: sample payloads and sequence flows instead.
3. Persona test: you, and the client in the Client profile, click through real tasks; hesitations go into the 3.6 test log; the feedback button captures comments.
4. Prototype approval (client approval in the Client profile).
5. Stories and acceptance criteria drafted per screen and use case, each tagged with BR, use case, persona and screen; edge cases hunted from rules, states and CRUD conditions.
6. Functional requirements drafted from the acceptance criteria, with drift flags.
7. Rules (3.7), NFRs (3.3, kit defaults per profile plus deviations), data dictionary (3.4, fields from the prototype's forms, PII flagged) and interfaces (3.5, with sample payloads).
8. Module fit-gap applied: module-backed stories arrive pre-written; only the gap is new.
9. Backlog order and release horizons proposed (the slice plan itself now comes after Architecture).
10. Approval: stories as one batch (your ticket approval), plus backlog order and release horizons.

**Minimum standard**

| Record | Required | Quality checks |
| --- | --- | --- |
| Story (US-) | Persona, story, BR, use case, screen, priority, acceptance criteria | At least one happy and one edge or negative criterion; fits one slice; "so that" states real value |
| Acceptance criterion | Given / When / Then | Measurable, no vague words; maps to a test |
| Functional requirement (FR-) | "The system shall…", linked stories | Rules referenced by ID, never restated |
| Rule (RULE-) | Statement, why, owner, enforced in | Every rule has a place in a FR, field or interface |
| NFR | Target as a number, verification method | Every category in the checklist covered or marked not applicable |
| Data field | Glossary name, type, required, validation, source, owner, data class | Personal data flagged; names match the glossary |
| Interface (INT-) | Direction, trigger, auth, error handling, field mapping, sample payload | Failure path specified, not just the happy path |
| Slice (SL-) | Stories, layers touched, demo-able outcome, out of scope, dependencies | Fits one fresh agent context; vertical, never one layer |

**Decisions**

- Client profile: the client approves the prototype, but until client logins exist (phase 2) you approve on their behalf. The approval record says so: "approved by Austin Smith on behalf of Sarah Kim (sponsor)".
- Slice size: a soft target of about 190k tokens of agent context per slice, not a line-count cap. The slice planner warns and suggests a split when a slice looks larger; you can proceed anyway.
- Phase 4 is renamed Architecture: ADRs, threat model, deploy adapter choice. The design kit and prototype live in Requirements.
- Tracer bullet: SL-01 must run end to end through every layer (screen, API, database, stubbed external systems), proven by an automated end-to-end test. A deployed preview link is optional.

* Test batches: slices can be grouped into a batch (for example one feature or use case) that you accept together. Agents still test every slice and each still gets a slice card; the batch gets one combined card and one UAT pass. The WIP limit applies to review units: agents may build batch N+1 while batch N awaits you, never N+2. Per project, choose slice-by-slice or batches; batches of about 3–5 slices keep reviews manageable.

## Phase 4: Architecture (locked 14 Oct)

Architecture records the few hard-to-reverse technical choices, threat-models the design, and picks where it runs. Most of it is generated; you approve the ADRs and any residual security risk.

**Flow**

1. The architect agent reads the Brief, use cases, NFRs, interfaces and fit-gap.
2. It picks the archetype starter, modules and deploy adapter; each hard-to-reverse choice becomes an ADR (stack, database, auth provider, hosting and region, multi-tenancy, integration pattern).
3. Architecture view generated: components, which component owns which data.
4. Data model generated from the data dictionary, with every field's data class.
5. Threat model: the security agent walks every trust boundary (below) and writes threats and controls to the register.
6. Environments from the adapter defaults; deviations recorded (e.g. data must stay in Australia).
7. Automated design checks replace the design review meeting: every rule has a home, every entity an owner and data class, every threat a control, every technology choice an ADR.
8. Slice plan: drafted against the approved architecture (starter, modules, adapter). SL-01 is the tracer bullet through every layer; then vertical slices ordered by value and risk, sized for one agent session. 9. Approval: ADRs, residual risk and the slice plan together.

**Security model**

| When | What happens | Who |
| --- | --- | --- |
| Discovery | Regulations, data sensitivity and business security needs captured: who must never see or do what, approvals and separation of duties, fraud and abuse incentives, audit duties, the client's own security policies. Requirements: abuse cases written beside user stories, reviewed by the security agent | BA agent, you confirm |
| Architecture | Data classified; trust boundaries mapped; STRIDE threats per boundary; controls designed | Security agent; you approve residual risk |
| Every PR | Dependency scan, secret scan, static code analysis; checks for auth on every endpoint, input validation, database access policies, security headers; negative permission tests from the CRUD matrix | Security agent, CI; merge blocked on critical or high |
| Before release | Automated attack scan of the preview; probing scaled by profile; release security checklist | Security and QA agents |
| Operate | Weekly vulnerability scan; 48-hour fast path for critical issues; secret rotation; quarterly access review; restore tests | Maintenance agents; you approve deploys |
| The factory itself | Agents get least privilege, never merge or touch production secrets; client documents and web pages are treated as data, never instructions; third-party skills reviewed before install | Kit rules |

**STRIDE in plain words**

| Threat | Question asked at each boundary | Typical controls |
| --- | --- | --- |
| Spoofing | Can someone pretend to be another user or system? | Login, MFA, session expiry, signed webhooks |
| Tampering | Can someone change data they shouldn't? | Server-side validation; never trust values from the browser |
| Repudiation | Can someone deny they did something? | Append-only audit trail |
| Information disclosure | Can data leak to the wrong person? | Access policies per row, encryption, no personal data in logs, plain error messages |
| Denial of service | Can someone overload or abuse it? | Rate limits, upload size limits, timeouts |
| Elevation of privilege | Can a normal user gain admin powers? | Roles from the CRUD matrix, negative tests for every condition |

**Decisions**

- Security baseline: OWASP ASVS (version 5) Level 1 for Lite, Level 2 for Client and SaaS; Level 3 is an option chosen at project setup; the factory suggests it when the client holds ISO 27001 or SOC 2, or works in a regulated industry. Those projects also get a compliance evidence pack exported from the trace: change approvals, code reviews, security findings and fixes, access reviews, test results.
- ASVS covers application security only, so the kit adds: OWASP Top 10 for LLM applications on any app with AI features; cloud configuration checks (database advisors, hosting settings); supply-chain controls (pinned dependencies, lockfiles, a software bill of materials); and a privacy checklist against the Australian Privacy Principles and the Notifiable Data Breaches scheme. Organisation-level certifications (ISO 27001, SOC 2) are out of scope unless a client requires evidence.
- Data location: default Australia (Sydney region) for Australian clients, but asked every time at project setup.
- Penetration testing: automated attack testing before every release; a human pen test only when a client requires and funds it.

**Compliance profiles.** Discovery records where the client operates, where its users are, what data is collected and whether payments or health data are involved. The factory then switches on the matching profiles; each maps legal requirements to engineering controls and the evidence that proves them, kept in a per-project compliance register beside the threat register.

| Profile | Applies when | Examples of controls |
| --- | --- | --- |
| Australian Privacy Act (APPs) and Notifiable Data Breaches | Default for Australian clients | Collection notices, access and correction, breach assessment within 30 days and notification as soon as practicable |
| GDPR / UK GDPR | Users in the EU or UK | Lawful basis and consent records, data subject rights (access, deletion, portability, correction), DPIA for high-risk processing, EU data residency or transfer safeguards, 72-hour breach notification, records of processing |
| CCPA / CPRA | California users and the business meets the thresholds | Right to know, delete and correct; "Do Not Sell or Share" opt-out; limits on sensitive data; privacy notice disclosures |
| Others as triggered | e.g. NZ Privacy Act, Canada PIPEDA, PCI DSS for card data, HIPAA for US health data, APRA CPS 234 for Australian financial entities, Spam Act and CAN-SPAM for email | Mapped the same way when switched on |

Common controls become a **privacy module**: consent and cookie management, data export and deletion requests, retention and purge jobs, a processor list (hosting, database, error tracking) with data processing agreements. The factory produces engineering controls and evidence; legal interpretation and sign-off stay with the client's lawyer.

## Phase 5: Develop (locked 14 Oct)

Agents build one slice per fresh context, test-first, and nothing reaches you until independent reviewers and CI have passed it. When the spec is unclear, agents ask instead of guessing.

**Flow per slice**

1. The conductor picks the next Ready slice within the WIP limit (Ready = stories approved, criteria written, screens and dependencies in place).
2. Setup: a GitHub issue and branch named with the slice and story IDs; a fresh agent session loaded with a small context pack (its stories and criteria, rules, data, interfaces, ADRs, kit, module docs, gotchas) through the agent interface.
3. The coder writes a plan file, visible in the agent feed (no approval needed).
4. Unknowns get a time-boxed spike first.
5. Build test-first: the first test is the slice's own tracer; modules, registry blocks and generators are used before any custom code.
6. Self-checks: types, lint, unit tests, acceptance tests.
7. Pull request opened; CI runs build, tests, security scans, trace checks and design checks.
8. Independent review, without the coder's reasoning: code reviewer (standards, and every criterion ID covered), security agent (on qualifying slices), UX and accessibility reviewer (matches the kit, passes accessibility checks).
9. Fix loop on blocking comments.
10. Docs updated in the same PR: feature page, API register, migrations, developer guide gotchas.
11. Slice card generated; the slice moves to Test.

**Guardrails**

- Ask, don't guess: an ambiguous or contradictory criterion raises a clarification card to you and blocks only that story.
- No scope creep: agents build only what the story says; ideas go to a suggestions list for you.
- Escalation: a slice that fails review three times stops and comes to you with a summary.
- Destructive migrations need your approval before merge.
- Tokens and cost are recorded per slice.

**Definition of Done (automated)**

- Every acceptance criterion has a passing test
- Trace complete: story → FR → PR → tests
- No critical or high security findings open
- Accessibility checks pass
- Every migration has a rollback
- Docs updated
- Slice card complete

**Decisions**

- Slices merge into an integration branch after agent review passes; into main only after your acceptance. Main = everything you have approved.
- A slice that fails review three times escalates to you.
- Up to 3–4 slices build in parallel per project, depending on size; the conductor never runs two slices that change the same module at once. Parallel builds sit inside the review-unit WIP limit.

**Models per agent role** (a setting in each agent spec, tuned by the learning loop)

| Model | Agents | Why |
| --- | --- | --- |
| No model (plain code) | File sorting and dedupe at intake, grouping duplicate alerts, release notes and reports filled from structured records, formatting | Mechanical work is done by scripts and templates: free, instant, never wrong in new ways |
| Sonnet | Claim extraction, BA drafting, designer, coder (builds from the plan), test author, QA explorer, docs writer, UX reviewer, issue triage | The workhorse; quality matters here |
| Opus | Slice planning, each slice's implementation plan, architect, security agent, code reviewer, conductor, learning agent | Planning and judgement: a bad plan or a missed flaw costs the most rework |
| Fable (top tier) | None by default | Reserved for escalations Opus cannot solve; uses allowance fastest |

**Pattern per slice:** Opus plans, Sonnet builds, Opus reviews (Claude Code's opusplan mode). **Haiku is not used.** A role moves from Opus to Sonnet only when its evals show equal quality.

## Phase 6: Test (locked 14 Oct)

Agents find and fix what they can before you see anything; you only judge whether it is right. Each review unit (slice or batch) reaches you as one card with proof attached.

**Flow per review unit**

1. The review unit is deployed to a test preview.
2. The QA explorer clicks through every acceptance criterion in a real browser, runs exploratory charters from the rules, states and permission conditions, and records video and screenshots.
3. Automated checks: regression pack, accessibility scan, browser smoke tests, performance where an NFR is touched, an attack scan of the preview.
4. Defects agents find go back to the coder automatically (the three-round rule still applies); only unresolved or unclear ones reach you.
5. The card is generated: what changed in plain English, preview link, walkthrough video, 3–5 "try this" steps with logins filled in, proof counts, known limits.
6. Your decision: Accept, Accept with notes (small follow-ups become stories), or Reject (becomes a defect or a change request). The feedback button works throughout.
7. Accepted work merges to main; the trace updates; UAT scripts accumulate for release.

**At release**

- Non-functional report and test exit summary are generated; you approve the exit and any waivers.
- UAT checklists are generated in plain English per persona; sign-off by the registered approvers (you on their behalf until client logins exist).

**Minimum standard**

| Record | Required |
| --- | --- |
| Card | Every criterion shows its evidence (test, screenshot or video); known limits stated |
| Defect | Steps, expected, actual, evidence, severity, which FR or rule it breaks |
| Acceptance | Who, role, decision, notes, version |

**Decisions**

- Test environments come from the deploy adapter, best first: a preview per review unit (Vercel, Netlify, Render, Railway and others support this); else a shared staging environment where review units queue and deploy one at a time; else a temporary environment the QA agent spins up in CI. Each adapter declares which it supports.
- Agent-found bugs are fixed without asking you, up to the three-round limit.
- UAT checklists live in the dashboard and export as a document for clients. A completed document can be uploaded back; the agent reads the results into the dashboard and logs failures as defects.

## Phase 7: Release (locked 14 Oct)

A release is assembled from accepted work, checks itself, and waits for one Go from you. Rigour sits on database changes, because data loss cannot be rolled back.

**Flow**

1. Release scope generated from accepted work on main: stories, FRs, migrations, API changes, and anything descoped with where it went.
2. Go-live checklist evaluates itself from evidence: test exit approved, UAT signed, security findings closed or accepted, backups verified, alerts on (Operate mode), rollback rehearsed on staging, comms ready (Client profile), handover pack ready (Handover mode).
3. Migration safety: destructive changes flagged with the point of no return; a database snapshot is taken automatically before deploy.
4. Comms (Client profile): user notice, support brief, stakeholder note and quick guides drafted from the feature docs; you approve before anything is sent.
5. Go: one approval from you, with any waivers listed.
6. Deploy through the adapter, then smoke tests on production by the QA agent (safe, read-only checks) with screenshots.
7. Release notes (technical and plain English) and the knowledge base update automatically.
8. Hypercare (Client profile or Operate mode): daily summary from monitoring; the exit rule is checked automatically; you approve the exit.
9. Handover mode: the handover pack goes to the client (runbook, environments and access, alert spec, feature docs, knowledge base, ADRs, trace export, compliance evidence pack at ASVS Level 3); client sign-off recorded, on their behalf for now.
10. Post-implementation review (Client and SaaS): drafted after hypercare; you approve the actions, which feed the learning loop; 30- and 90-day KPI reviews are scheduled.

**Decisions**

- Automatic rollback when live checks fail and nothing irreversible has run; past the point of no return it always asks you.
- Hypercare: 7 days by default for client projects, ending after 3 stable days with no Sev-1/2; you can end it early at any time (recorded as an override).
- Releases happen on demand, when you decide enough accepted work is ready.

**Documentation every release produces**

| Output | Audience | Contents | Where |
| --- | --- | --- | --- |
| Developer docs | Developers and agents, the client's team at handover | Setup, code map, how-tos, gotchas, architecture view, ADRs, API reference (from OpenAPI), database change log, environments, runbook | Generated docs site in the repo; exported in the handover pack |
| Technical changelog | Developers | Every change with its PR, story, migration and API changes, versioned (major.minor.patch) | Repo and dashboard |
| Patch notes | End users and the client | Plain-English what's new, what's fixed, what changed for them; screenshots where helpful | In-app "What's new", email to the client, dashboard |

All three are generated from the trace and updated in the same change as the code, so they can't drift. Hotfixes get their own patch notes.

## Phase 8: Maintenance (locked 14 Oct)

The reactive and proactive loops (see Maintenance and observability) run in Operate mode; this phase sets support hours, budgets and what the client sees.

**Inputs:** Sentry errors, uptime alerts, logs, Dependabot and code scanning, client emails and reports through the inbox, and in-app feedback. Every signal becomes an issue traced to the story and code it touches.

**Work types and how they flow**

| Type | Flow |
| --- | --- |
| Bug (6.1) | Reactive loop: reproduce with a failing test, fix, your check, your deploy approval |
| Security (Sec-Critical) | Fast path: exposure confirmed in 15 min, patched within 48 h, one-tap approval |
| Change request (6.2) | Must serve a BR or pain point; your decision; approved ones run a mini cycle: story, slice, test, release |
| Preventive (7.1, 7.2, 7.5) | Proactive schedule; agents propose, you approve within the maintenance budget |

**Maintenance budget (7.4):** per Operate project, a monthly share of agent usage split across features, reactive and preventive (default 60/20/20). Preventive is never borrowed for reactive; overflow triggers a review with you.

**Retirement (8.3):** drafted from interfaces, data and dependencies when a system is replaced; your approval.

**Decisions**

- Support hours: Melbourne business hours; after-hours response to serious issues only when a client contract pays for it.
- Handover mode: no warranty loop; maintenance agents stop at handover.
- Client reports: generate on demand for Operate clients (system health, KPIs against baseline, work done, cost), as a shareable link or an exported report.
- Budget: a warning on the dashboard when a project nears its monthly agent allowance; no notifications.

## ID and trace schema (agreed 15 Oct)

Every fact is one small file in the project repo with an ID and typed links; an index rebuilt on every push powers the dashboard, the agent interface and the automatic checks.

**1. Repo layout (one repo per project: records, design, code and docs together)**

```text
project.yaml          client, profile, mode, region, security level, adapter, kit, approvers
records/
  sources/SRC-001/    original file, untouched, plus meta.yaml
  claims/  stakeholders/  pains/  kpis/  brs/  personas/  glossary/
  decisions/  rules/  processes/  usecases/  screens/
  stories/  frs/  nfrs/  data/  interfaces/  slices/
  adrs/  threats/  approvals/
design/tokens.json    the project kit
app/                  the code
docs/                 generated developer docs, changelog, patch notes
```

**2. IDs:** prefix plus number, never reused, unique within the project; across projects written as `ACME-OPS:BR-01`. The prefixes keep your template conventions.

| Prefix | Record | Prefix | Record |
| --- | --- | --- | --- |
| SRC | Source | US | Story (with AC1, AC2…) |
| CLM | Claim | FR | Functional requirement |
| SH | Stakeholder | NFR | Non-functional requirement |
| PP | Pain point | WF | Screen |
| KPI | Success measure | ENT / INT | Entity / interface |
| BR | Business requirement | SL | Slice |
| PER | Persona | ADR | Architecture decision |
| TERM | Glossary term | THR / SEC | Threat / security finding |
| DEC / RULE | Decision / rule | TC / UAT | Test case / UAT script |
| PROC / UC | Process / use case | DEF / ISS / CR / TD | Defect / issue / change request / debt |
| APR | Approval | REL | Release |

**3. Record format:** Markdown with a YAML header. Example:

```yaml
---
id: BR-01
type: business_requirement
title: Priority items are identified at submission without human judgement
status: approved        # draft | review | approved | superseded | retired
priority: must
owner: SH-01
links:
  evidence: [PP-01, CLM-0003, CLM-0014]
  measured_by: [KPI-02]
version: 3
approval: APR-0012
created_by: agent:ba
---
Plain-language body.
```

**4. Links:** stored on the downstream record pointing upstream; the index computes the reverse direction, so every link lives in exactly one place.

| Record | Must link to | Link type |
| --- | --- | --- |
| Claim | Source, stakeholder | from\_source, said\_by |
| Pain point | Confirmed claims | evidence |
| KPI | Pain point | baseline\_of |
| BR | Confirmed claims; the KPIs that measure it (KPIs are set in Discovery, before BRs) | evidence, measured\_by |
| Decision, rule | Claims or stakeholder who decided; record replaced | decided\_by, supersedes |
| Use case | BRs | serves |
| Screen | Use cases | realises |
| Story | BR, use case, screen, persona | serves, from\_screen |
| FR | Stories; rules by ID | derived\_from, enforces |
| Entity, interface | Stories or FRs that need them | required\_by |
| ADR | NFRs, rules or constraints that drove it | driven\_by |
| Threat | Entity or interface; controls | threatens, controlled\_by |
| Slice | Stories | delivers |
| PR (commit trailers) | Slice, stories, FRs | implements |
| Test | Story and AC, FR or rule | verifies |
| UAT script | Stories (Must) | accepts |
| Release | PRs and slices | ships |
| Issue, defect | Release; story, FR or rule it breaks; code | found\_in, breaks |
| Fix PR | Issue or defect | fixes |
| Approval | Record and version | approves |

**5. Code to records:** branch names carry the slice and story (`sl-003/us-007-priority-sort`); commits end with `Refs: US-007, FR-012`; the PR template requires IDs; tests are named by criterion (`US-007 AC2: priority item jumps the queue`); migrations carry their story or defect ID; production errors map to releases and from releases to slices.

**6. Approvals:** each one is an APR record (record, exact version, decision, approver, role, on behalf of, date, accepted risks, comment) merged with the change. Editing an approved record creates a new version that returns to review. Decisions and rules are append-only and superseded, never deleted.

**7. Automatic checks (every PR and nightly)**

| Check | Result when failing |
| --- | --- |
| Header matches its schema; minimum standard met | Missing blocks the gate; Thin shows as risk |
| Links point at records that exist | Blocks merge |
| Orphans: code with no story, story with no BR | Blocks merge |
| Coverage: every Must BR has a story; every AC a test; every rule a home and a test; every threat a control | Blocks release |
| Approved record changed after approval | Back to review; on your attention list |
| Story changed, linked FRs not reviewed | Drift flag |
| Code names differ from the glossary | Warning |
| ID reused | Blocks merge |

**8. Index and agent interface:** a sync job turns the repo into tables (records, links, approvals, events for agent runs, CI results, deploys and costs). The dashboard reads them; agents use tools like get\_record, trace\_up, trace\_down, find\_orphans and search through the agent interface instead of reading files.

**9. The full thread, walked both ways**

Down, from a person to production: Sarah Kim (SH-01) said it on the kickoff call (SRC-001) → claim CLM-0003 → pain PP-01 with baseline KPI-02 → BR-01 → use case UC-01 → screen WF-05 → story US-007 with AC1–AC3 → FR-012 enforcing RULE-01 → slice SL-003 → PR-118 → tests TC-112–114 → UAT-01 → release REL-1.0 → live KPI-02 reading → issue ISS-014 → fix PR-121 → REL-1.0.1 patch notes.

Up, from a line of code: the code changed in PR-118 → SL-003 → US-007 → BR-01 → evidence CLM-0003 → "Sarah Kim said this on 2 Oct, 12:40 into the kickoff call", with every approval on the way and who gave it.

## Optimisation research

Researched 14 Oct 2026. The biggest savings are built in: the right model per agent, protecting the prompt cache, and boilerplates so agents only write the last 5–10%. Non-Claude models cannot run in cloud sessions.

**1. Cheaper models**

- Cloud sessions always run Claude models; Anthropic's docs say gateway variables set in a cloud environment are not applied. The local CLI can point at Kimi, DeepSeek or GLM, but Anthropic doesn't support it and features break (caching, auto-compact, tool search).
- Inside Claude, each agent's spec can set `model: haiku | sonnet | opus`. Reported API prices per million tokens (input/output): Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 for short prompts. Haiku may undercut Kimi and GLM; only DeepSeek flash is clearly cheaper.
- Cloud sessions draw on plan limits, not per-token billing.
- **Decision:** stay on Claude; route by role. A non-Claude reviewer could run later as a GitHub Actions job that comments on PRs.

| Role | Model |
| --- | --- |
| Mechanical work (sorting, dedupe, filling templates) | No model: scripts |
| Coder (build), tester, designer, UX reviewer, docs writer, QA explorer, triage, maintenance planner | Sonnet |
| BA, story writing, planning, architecture, security review, code review, learning | Opus |

The roster in `agent-specs.md` is the source of truth for each agent's model.

**2. Token reduction, ranked by impact**

1. Fix each agent's model and effort at session start; switching mid-session re-reads history uncached.
2. Protect the cache: stable prompt order; set subagent cache lifetime to 1 hour for long-running agents; same-directory sessions share cache.
3. Small base context: CLAUDE.md under 200 lines, detail in skills, SKILL.md under 500 lines, unused skills hidden, CLI tools over MCP where possible (MCP tool search is on by default).
4. Filter noisy output with hooks (test logs reduced to failures) and push verbose work into subagents that return summaries.
5. Clear between unrelated tasks; rewind rather than compact to abandon a path.
6. Measure first with `/usage` and telemetry. Community tools (RTK, Caveman, repomix compress) claim 40–90% savings but have no independent benchmarks: A/B test before adopting.

**Output token discipline.** Output tokens cost 5x input, so the kit sets output rules by audience. Records and code are never shortened.

| Output | Rule |
| --- | --- |
| Human-facing (slice cards, attention cards, status, digests) | Answer and next action first; no preamble, recap or closers; one next step. Rules borrowed from i-have-adhd (MIT), not the plugin itself. |
| Agent-to-agent | Structured records (frontmatter, JSON) instead of prose; reference IDs, never restate rules; never echo inputs back; subagent summaries capped |
| Code | Edits and diffs, never whole-file rewrites; no explanatory comments beyond what the standard requires |
| Generated docs and cards | Filled from templates and data, not written freehand |
| Records (ACs, tests, threats, rules) | Complete, never capped or trimmed |
| Reasoning | Effort level set per agent: low for triage and formatting, high for architecture and security |

Each rule is A/B tested: output tokens per slice against review rejection rate and escaped defects. A rule that lowers quality is dropped.

**3. Code navigation**

- Official LSP plugins give agents go-to-definition, references and type errors, but language servers don't start in cloud sessions.
- For cloud, Serena (MIT, LSP-based MCP) installed in the environment setup is the candidate; adopt only after an A/B test, as it reports no measured savings.
- A repo map (Aider-style signature summary) generated in a session-start hook is a cheap pattern to copy.

**4. Matt Pocock skills (MIT, adapt not copy)**

| His skill | Factory use | Customisation |
| --- | --- | --- |
| grill-with-docs, grilling | Discovery interviews | Our claim, attribution and BR IDs; writes glossary and ADRs |
| wayfinder | Large foggy efforts | Decision tickets feed 3.7 |
| prototype | Prototype step | Built on the selected design kit |
| to-spec | Brief and spec | Our IDs and approval gate |
| to-tickets | Slice plan | Tracer bullet first; human approval label before publishing |
| implement, implement-spec | Coder and conductor | One slice per fresh context; WIP limit |
| tdd | Test author | First test is the tracer bullet |
| code-review | Reviewer | Spec axis checks every AC ID |
| triage, diagnosing-bugs | Reactive loop | Reproduce first, regression test |
| retro | Learning loop | Feeds kit proposals |
| pr | Slice card | Adds preview, video, proof counts |
| git-guardrails | Safety | Adopt as is |

His key lesson: one team sliced 26 tickets by layer and spent about 20 agent runs per ticket, roughly 75% rework. Vertical slices that fit one context window avoid this.

**5. Design kits**

- Foundation: shadcn/ui (Base UI, Tailwind v4). A design kit = a stored shadcn preset code plus an optional tweakcn theme, applied with `shadcn apply` and recorded per project.
- Kit catalogue: a private shadcn registry, browsed by agents through the shadcn MCP, seeded from tweakcn presets and Anthropic's theme-factory themes. UI UX Pro Max (MIT) suggests 3 kits from the Brief.
- Design board → prototype: the designer agent uses Anthropic's frontend-design skill with the chosen kit, renders 2–3 directions, you pick one, then a clickable prototype is built on it. Figma MCP is used when a client brings an existing design system.

**6. Boilerplates**

| Layer | What | Tool |
| --- | --- | --- |
| Archetype starters | 3 skeletons: SaaS, internal tool, integration worker; each ships auth, DB, UI kit, CI, agent guide | Copier templates (updatable) or GitHub template repos |
| Feature modules | Audit log, RBAC, notifications, upload, admin, billing | Private shadcn registry (supports multi-file modules, dependencies, env vars) |
| Generators | New CRUD resource, webhook handler, job | `turbo gen` or Nx generators |
| Shared packages | Code identical everywhere: logger, API clients | Private npm packages |

Starting points: next-forge (MIT), Next.js SaaS Starter (MIT), Refine for internal tools (MIT), Trigger.dev or Inngest for integration workers. Paid option: supastarter allows client use; MakerKit needs per-client licences. A scheduled drift check opens upgrade PRs when templates or modules change.

**Modules: the 80% layer.** Boilerplates give the first \~40%; modules are complete, tested features that take a build to \~80% before customisation. A module is a vertical package, not just code:

| A module ships | Why |
| --- | --- |
| Code, schema migration, screens, API | The working feature |
| Config and extension points | Customise by settings, not by editing module files, so updates still apply |
| Pre-written stories, ACs, rules and NFRs with parameters | Requirements arrive traced, not rewritten |
| Tests and UAT script templates | Proof comes with it |
| Feature doc and knowledge-base article | Docs come with it |

**How modules fit the BA flow:** in Analysis, the BA agent runs a **fit-gap** against the module catalogue ("BR-03 is \~80% covered by Approval Workflow v2; the gap is two-level approval and SLA pausing"). You approve the fit-gap; the gap becomes the custom slices. This mirrors how BAs assess packaged software.

**How the catalogue grows:** built when a real project needs it, never up front. After a project, the learning loop proposes extracting generic features into modules, stripped of client specifics, for your approval. Likely early modules: approval workflow, SLA timer with business hours, audit trail, RBAC, notifications, file upload, admin CRUD, CSV import/export, org/multi-tenant, billing, common connectors.

**7. Observability default kit (about $0–26/month to start)**

| Need | Tool | Agent access |
| --- | --- | --- |
| Errors and performance | Sentry, one project per app tagged by client | Official MCP, project-scoped |
| Runtime logs | Vercel Observability (Axiom later for retention) | Vercel CLI and MCP |
| Uptime and status page | Better Stack free (or Checkly for monitors-as-code) | API |
| Product analytics (SaaS only) | PostHog | Official MCP |
| Dependencies | Dependabot (+ code scanning on public repos) | GitHub CLI |

The same tags (client, project, env) go everywhere so agents filter consistently.

**8. Cost tracking**

- AI cost: Claude Code exports token and cost metrics through OpenTelemetry, tagged with client, project, agent and phase via environment variables set by the launcher. On a subscription, cost is allocated by each project's token share; on API billing, the Admin Usage & Cost API is authoritative.
- Infrastructure: Vercel billing API gives per-project daily cost; GitHub Actions usage per repo (needs an org); Neon is billed through the Vercel Marketplace; until F-09 confirms it shows in Vercel's billing data, its cost is estimated from its pricing model.
- One cost ledger table (date, project, client, source, category, amount, basis: billed / estimated / allocated), filled nightly, shown weekly and monthly with a build vs maintain split and budget alerts.

Sources: [LLM gateway](https://code.claude.com/docs/en/llm-gateway) · [cloud environments](https://code.claude.com/docs/en/cloud-environments) · [subagents](https://code.claude.com/docs/en/sub-agents) · [pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [costs](https://code.claude.com/docs/en/costs) · [prompt caching](https://code.claude.com/docs/en/prompt-caching) · [code intelligence](https://code.claude.com/docs/en/plugins/code-intelligence) · [monitoring usage](https://code.claude.com/docs/en/monitoring-usage) · [Serena](https://github.com/oraios/serena) · [mattpocock/skills](https://github.com/mattpocock/skills) · [tracer bullets](https://www.aihero.dev/tracer-bullets) · [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) · [shadcn MCP](https://ui.shadcn.com/docs/mcp) · [shadcn registry items](https://ui.shadcn.com/docs/registry/registry-item-json) · [tweakcn](https://github.com/jnsahaj/tweakcn) · [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) · [next-forge](https://github.com/vercel/next-forge) · [Copier updates](https://copier.readthedocs.io/en/stable/updating/) · [Sentry pricing](https://sentry.io/pricing/) · [Sentry MCP](https://mcp.sentry.dev/) · [Better Stack pricing](https://betterstack.com/pricing) · [Vercel billing API](https://vercel.com/docs/rest-api/billing/list-focus-billing-charges) · [Usage & Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) · [ccusage](https://github.com/ryoppippi/ccusage)

## Open questions and next steps

All design is agreed. The next step is Stage 0 in `build-plan.md`.

**Next steps**

- [ ] Your own review of this doc; comment anywhere you disagree
- [x] Phase deep-dives, one at a time: Discovery, Analysis, Requirements, Architecture, Develop, Test, Release, Maintenance — exact fields, IDs, screens and gates
- [x] ID and trace schema (frontmatter format, link types, check rules)
- [x] Agent roster: six-part spec per agent, with profile and mode overlays, reviewed one by one
- [x] Dashboard design: views, attention queue rules, testing screens
- [x] Build order: kit and schema → trace checks → dashboard → agents phase by phase → maintenance loops
- [ ] Sample project: a fake client brief the factory runs end to end after every change

**Dashboard design status (15 Oct):** UX and screen structure agreed on the Factory Dashboard Design canvas: Overview, Project, Board (with a Needs you column), Testing, Thread explorer (drill-down table), Test accounts, Integrations, Cost, Factory. Visual polish is deferred: restyle to a minimal modern SaaS look later, ideally by running the dashboard through the factory's own design kit picker.

**Deferred to phase 2**

- Weekly sprint-style report from slice data
- Client portal logins; direct-to-client questionnaires; shareable UAT links so client testers can run checklists and record results themselves
- Search across transcripts (vector search)
- Extra deploy adapters beyond Vercel

**Open questions**

- Resolved: billing is a Max subscription, so AI cost per project is allocated by token share.
- Resolved: boilerplates and modules are built when a project needs them; not a blocker.
- Resolved: a non-Claude reviewer is a later experiment, run on your local computer through the Claude Code CLI.
- Resolved: cloud sessions run Claude only; observability default kit chosen; the interviewer stays method-neutral.
