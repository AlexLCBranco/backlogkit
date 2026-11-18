# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-5 — Real logo
**What:** an actual backlogkit logo (SVG): in the header and as the favicon. Simple, readable at 16 px, fits the dark look. Keep it in `public/`.
**Tests:** e2e: favicon and header logo load.

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

## Held (needs the owner's "go"; never built from "build the backlog")
