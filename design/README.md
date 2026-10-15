# Design references

These are design prototypes made during planning. They are **references for UX and screen structure**, not code to ship. Each `.dc.html` file is one screen in a design-canvas format; they need the canvas runtime to render, so read them as annotated markup (layout, copy, sample data, interactions in the `<script>` block).

| Folder | What it is | Status |
| --- | --- | --- |
| `dashboard/` | The factory dashboard: Overview, Project, Board, Testing, Thread explorer, Test accounts, Integrations, Cost, Factory | **UX agreed.** Visual style is deferred: restyle to a minimal modern SaaS look in F-11, through the factory's own kit picker |
| `kit-picker/` | Design kit selection: choose and tweak a kit, generated style guide, import a ready-made kit | Agreed in principle. Mix and match, component sources, motion rule and the design library still to be added (F-11) |
| `discovery/` | Early Discovery workspace: Inbox, Review, Session prep, Brief | Structure is useful; the visual design was rejected as too busy. Rebuild in the dashboard's layout |

## Rules for using them

- Build the dashboard to match the **structure and behaviour** of `dashboard/`: one clear focal point per screen, balanced with key numbers, lists and activity.
- Sample data (Acme Ops Portal, Ledger Sync, Harbour Bookings, all IDs and figures) is made up. Replace it with real data from the index.
- The Thread explorer is a **drill-down table**: requirements → a requirement's stories (with "came from") → everything a story turned into. Breadcrumb to go back up.
- The Board has a **Needs you** column for questions, approvals and escalations, separate from **Ready to test**.
