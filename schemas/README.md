# Record schemas

JSON Schema (draft 2020-12) for every record type in the trace schema, plus `project.yaml`.

**Generated. Don't edit these files by hand.** The source is `packages/schemas/src/definitions.ts`. After changing it, run:

```sh
pnpm --filter @factory/schemas generate
```

A test fails if this folder is out of date.

- `index.json` maps each ID prefix to its record type, schema file and `records/` folder.
- Base fields on every record: `id`, `type`, `title`, `status`, `version`, `created_by`.
- The minimum standard (type-specific required fields and links) applies from `review` onward. Drafts need only the base fields and a few always-required ones, such as a claim's source.
- Work items (`SEC`, `DEF`, `ISS`, `CR`, `TD`) use `open | in_progress | resolved | closed | wont_fix` and need their fields from the start.
- Extra fields are allowed. Link types are a closed list.
- These schemas check one record at a time. Whether a linked record exists is the F-01 validator's and trace checker's job.

Check records with:

```sh
pnpm --filter @factory/schemas build
node packages/schemas/dist/cli.js path/to/project
```
