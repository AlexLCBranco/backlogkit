# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-6 — Browser tab title follows the page
**What:** the tab title says what's open ("backlogkit · calendarkit backlog"), like calendarkit and footykit. Owner's rule for all apps.
**Tests:** e2e: switching project changes the title.

### BL-7 — Ideas page: every repo's ideas in one place, plus ideas with no repo
**What:** a top-level **Ideas** tab in the header, next to All repos (`#/ideas`).
- Lists every project's `IDEAS.md` items, grouped by repo (repo name links to the project page), each with its copy
  button, like Planned in All repos. Repos with no ideas are left out.
- A first group, **Unassigned**, for ideas that belong to no repo yet. They live in a new file in this repo,
  `UNASSIGNED_IDEAS.md`, same line format as `IDEAS.md` but with their own IDs: `- U-1 — the idea (YYYY-MM-DD)`.
  Create the file with a short header like `IDEAS.md`'s, and no items.
- Ideas stay separate from planned and built everywhere: never shown inside Planned or Built.
- Search already covers ideas; make Unassigned ideas searchable too.
- Add `UNASSIGNED_IDEAS.md` to the rules in CLAUDE.md ("Feature backlog, built list and ideas"): an idea from the
  owner that fits no repo goes there; "assign U-n to <repo>" moves it to the bottom of that repo's `IDEAS.md` with the
  next free I ID and a `From U-n` line.
**Tests:** unit: parsing `UNASSIGNED_IDEAS.md` (empty file, missing file, items). e2e: Ideas tab shows the Unassigned
group and per-repo groups from fixture data, repos without ideas are absent, copy button works, search finds a U-n idea.

### BL-8 — Time estimates: build time and local test suite time
**What:** the owner wants to know roughly how long each planned item will take before running it.
- Each planned item can carry a line `**Estimate:** build ~N min · suite ~M min` (build = a Claude Code session building
  it; suite = the repo's full local test suite). Claude Code adds it when it reads an item that has none (when listing
  the backlog or before building), and says it's a guess.
- When an item ships, its `BUILT.md` line gets the real numbers: `(took N min, suite M min)`, measured, not guessed, so
  later estimates can be checked against them.
- Suite times vary a lot (the owner has seen very long runs), so estimates are rough ranges. Each repo records the duration of its last full local suite run and its longest one (measured) somewhere backlogkit can read (e.g. a line
  in `BUILT.md`'s header); backlogkit shows it on the project page.
- backlogkit shows the estimate on each planned card, the actual time on built items, and a total of planned estimates
  per repo and in All repos.
- Add the rule to CLAUDE.md ("Feature backlog, built list and ideas") here, and list in the report which other repos
  need the same rule added.
**Tests:** unit: parsing the Estimate line and the `(took …)` suffix (present, missing, malformed); e2e: a fixture
planned card shows its estimate, a built item shows its actual time, the repo total adds up.

## Held (needs the owner's "go"; never built from "build the backlog")
