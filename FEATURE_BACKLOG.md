# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-4 — Sort the project cards
A sort dropdown above the cards, applied inside each group (Active, etc.). Options:
- Backlog changed — newest first / oldest first (date of the last commit touching `FEATURE_BACKLOG.md`)
- Last change — newest first / oldest first (last push to the repo)
- Created — newest first / oldest first (repo creation date)
- Name — A–Z / Z–A
Default: Backlog changed, newest first. The choice is remembered in the browser (localStorage, wrapped in try/catch).
Show the backlog-changed date on each card ("Backlog changed 2026-11-17"), like Last push. Repos with no backlog file
or an unknown date go last in any date sort. Fetch the new dates server-side with the existing GitHub calls; keep
the number of requests low (works without a token for public repos; say in the report if rate limits are a risk).
Tests: unit test for every sort option including missing dates; e2e that changing the dropdown reorders the cards
and the choice survives a reload.

## Held (needs the owner's "go"; never built from "build the backlog")
