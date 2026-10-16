# Docs map

Start here. Don't read the docs end to end: find the sections the current slice needs below, then open just those. Headings are given exactly as written, so `grep -n "^## <heading>" docs/<file>` finds each one.

## Planning

| File | What it covers |
| --- | --- |
| `build-plan.md` | Build order: decisions, Stage 0, F-01 tracer bullet, F-02 to F-12 table, where everything runs, risks |
| `stage-0-plan.md` | Stage 0 running status, repo layout, items S0-1 to S0-7, spikes 1 to 5, Austin's steps A1 to A7 |
| `f-01-plan.md` | F-01 plan: decisions, contracts between streams, streams S1 to S8, files, tests, risks |
| `spikes/` | One write-up per spike: what we tried, what happened, the decision |

## design-doc.md

| Section | What it covers |
| --- | --- |
| Principles | The ten rules every design choice must follow |
| Profiles and modes | Lite, Client, SaaS, Headless profiles; Handover and Operate modes; what each switches on |
| Where the truth lives | Git as the record, the layers (Issues, PRs, Actions, index, dashboard, MCP), deploy adapters, kit distribution |
| How artefacts are handled | Approve, Living, Generated, Kit, Culled labels; technique, data and shell split |
| Ingestion and attribution | Sources inbox, claim extraction, attribution rules, claim trust by source type |
| Traceability | The thread from stakeholder to issue, FR and use-case decisions, checks on every merge |
| Approval points | Every routine and exception approval, by phase |
| Verdicts: Analysis pack | What happens to each of the 31 analysis templates |
| Verdicts: Development & QA pack | What happens to each of the 25 development and QA templates |
| Verdicts: Release pack | What happens to each of the 9 release templates |
| Verdicts: Maintenance pack | What happens to each of the 16 maintenance templates |
| Testing for humans | Slice cards, UAT checklists and what Austin judges |
| Learning loop | Project and factory memory, how lessons are proposed, trialled and approved |
| Maintenance and observability | Reactive and proactive loops in Operate mode |
| Agents | Six-part spec, layered overlays, draft roster (superseded by `agent-specs.md`) |
| Dashboard | Views: attention queue, kanban, testing, Thread explorer, project pages, factory |
| Phase 1: Discovery | Flow, minimum information standard per record, Brief structure, design kit structure and sources |
| Phase 2: Analysis | To-Be process, use cases, CRUD, state machines, fit-gap, minimum standard |
| Phase 3: Requirements | Prototype-led stories, FRs, rules, NFRs, data, interfaces, slices; minimum standard |
| Phase 4: Architecture | ADRs, threat model and trust boundaries, compliance profiles, slice plan |
| Phase 5: Develop | One slice per fresh context, test-first, review gates, escalation |
| Phase 6: Test | Test environments, slice cards, UAT, defects; minimum standard |
| Phase 7: Release | Release assembly, database change rigour, Go decision, handover pack, docs |
| Phase 8: Maintenance | Support hours, severities, budgets, client reporting |
| ID and trace schema | Repo layout, ID prefixes, record format, link table, code-to-record conventions, approvals, automatic checks, index |
| Optimisation research | 1 cheaper models, 2 token reduction, 3 code navigation, 4 Matt Pocock skills, 5 design kits, 6 boilerplates and modules, 7 observability kit, 8 cost tracking |
| Open questions and next steps | Status checklist, deferred to phase 2, resolved questions |

## agent-specs.md

Once an agent is built, its section here is a one-line pointer to `kit/agents/<agent>/spec.md`.

| Section | What it covers |
| --- | --- |
| How a spec is built | The six parts, quality bar, evals, overlays, and the rules every agent shares |
| Roster | All 17 agents with phase and model |
| Agent 1: Intake | Raw material to attributed, typed claims (Sonnet) |
| Agent 2: BA agent | Claims to Brief, then processes, use cases and fit-gap (Opus) |
| Agent 3: Designer | Kit suggestions, mix and match, clickable prototype (Sonnet) |
| Agent 4: Story writer | Stories with ACs, FRs, rules, NFRs, data and interfaces (Opus) |
| Agent 5: Slice planner | Tracer bullet first, then vertical slices and batches (Opus) |
| Agent 6: Architect | Starter, modules, adapter, data model, ADRs (Opus) |
| Agent 7: Security agent | Threat model, change review, preview attacks, compliance (Opus) |
| Agent 8: Conductor | Build line: routing, WIP and parallel limits, fix loops (code plus Opus) |
| Agent 9: Coder | One slice per session: Opus plans, Sonnet builds test-first |
| Agent 10: Code reviewer | Independent spec and standards review (Opus) |
| Agent 11: UX and accessibility reviewer | Rendered checks against prototype, kit and WCAG 2.2 AA (Sonnet) |
| Agent 12: Test author | Permission, rule, workflow and abuse tests, test data, UAT scripts (Sonnet) |
| Agent 13: QA explorer | Real-browser walkthroughs, exploration, smoke checks (Sonnet) |
| Agent 14: Docs writer | Dev docs, changelog, patch notes, feature docs, comms, handover (Sonnet) |
| Agent 15: Triage | Reactive loop front door in Operate mode (Sonnet) |
| Agent 16: Maintenance planner | Proactive loop, registers, reports; full proactive checklist and integration watch (Sonnet) |
| Agent 17: Learning agent | Lessons into skills, prompts, kit and estimates; two levels of memory (Opus) |
| Scripts and tools | Rules for scripts; use, hook or build; every script by area (setup, intake, traceability, build, test and release, operate, cost, learning, plumbing) |
