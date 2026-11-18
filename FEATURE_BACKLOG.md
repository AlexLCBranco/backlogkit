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

## Held (needs the owner's "go"; never built from "build the backlog")
