---
name: ba-discovery
description: The business requirements proposal format for the BA agent (ba-proposal.schema.json), with a worked example. Use when writing .factory/runs/<run>/proposal.json from confirmed claims.
---

# BR proposal

The BA agent writes one file, `.factory/runs/<run>/proposal.json`. It never writes `records/`: a script writes each BR as a record in review.

The input is `.factory/runs/<run>/input.json`: `claims` (confirmed only; each has `id`, `words`, `said_by`, `location`, `claim_type`) and `stakeholders`.

```json
{ "brs": [ { ...br } ], "parked": [ { ...parked ask } ] }
```

Each BR has:

- `title`: the outcome the business needs, in one line. No tool or design words (kanban, form, dashboard, app, button, screen). No numbers that are not in the claims.
- `value`: why it matters, using only facts and numbers from the claims.
- `priority`: `must`, `should`, `could` or `wont`.
- `owner`: the SH ID of the stakeholder whose claims carry the need.
- `evidence`: one or more claim IDs from the input. Never an ID that is not in the input.
- `body` (optional): a short note.

Each parked ask has `ask` (what was asked, in the person's words), `reason` (why it is not a BR: no evidence, or stated as a solution), `question` (what would unlock it), and `evidence` (claim IDs, if any).

Rules: an opinion or assumption alone is not enough evidence for a BR. A solution ("a kanban board") is parked with the question "What problem should this solve?", never turned into a BR title. Never drop an ask. Use empty lists when there is nothing.

## Worked example

Confirmed claims (Sarah Kim is SH-01, Tom Reyes is SH-02):

```text
CLM-01 SH-01 L6  "Last month 14 urgent requests missed their 4-hour pickup window"
CLM-02 SH-01 L6  "each one costs us a $250 credit to the customer"
CLM-03 SH-02 L5  "We only find them when a customer rings to chase"
CLM-04 SH-01 L10 "I think the team could spot urgent ones at a glance if we had a kanban board"
```

Proposal:

```json
{
  "brs": [
    {
      "title": "Urgent requests are found before their pickup window closes",
      "value": "Missed pickup windows cost a credit to the customer each time.",
      "priority": "must",
      "owner": "SH-01",
      "evidence": ["CLM-01", "CLM-02", "CLM-03"]
    }
  ],
  "parked": [
    {
      "ask": "the team could spot urgent ones at a glance if we had a kanban board",
      "reason": "Stated as a solution, not an outcome.",
      "question": "What problem should a kanban board solve that the urgent-request outcome does not already cover?",
      "evidence": ["CLM-04"]
    }
  ]
}
```
