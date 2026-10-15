---
name: factory-records
description: How to write a factory record file (Markdown with a YAML header) so it passes the schema check. Use whenever creating or editing a file under records/.
---

# Writing a record

A record is one Markdown file with a YAML header between `---` lines, then a plain-language body.

Every record has:

- `id`: the prefix plus a number, for example `SH-01` or `BR-01`. Never reused.
- `type`: the record type, for example `stakeholder` or `business_requirement`.
- `title`: one line.
- `status`: `draft`, `review`, `approved`, `superseded` or `retired`. New records are `draft`.
- `version`: starts at 1.
- `created_by`: `agent:<name>`, `human:<name>` or `script:<name>`.

Links go under `links:`, on this record, pointing upstream (for example a claim has `from_source: [SRC-001]`). Never add the reverse link to the other record.

The schema for each type is in `.factory/schemas/<type>.schema.json`. Read it before writing a record type you haven't written before.

Example:

```markdown
---
id: SH-01
type: stakeholder
title: Sarah Kim
status: draft
version: 1
created_by: agent:scribe
name: Sarah Kim
role: Operations manager
organisation: Acme
---

Sponsor for the ops portal.
```
