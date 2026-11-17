# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-2 — Move the all-repos built list here from gauntlet
gauntlet's `scripts/all-built.mjs`, its daily workflow `.github/workflows/all-built.yml` and its output `ALL_BUILT.md`
are cross-repo tooling and belong here. Move them to this repo (same daily schedule and on-demand run, same
`ALL_BUILT_TOKEN` secret, which the owner must add here: say so in the report), use the repo list from GitHub /
`projects.json` instead of the hard-coded `REPOS`, and also write `ALL_BACKLOG.md` (every repo's planned items, by
repo). Then, in a separate PR on gauntlet, delete the three files there and point any mention of them to backlogkit.
Do this only after BL-1, so the parser is shared with the site. Tests: the generator's output for mocked repos.

## Held (needs the owner's "go"; never built from "build the backlog")
