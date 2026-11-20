# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-20 — Searching a feature code explains it at the top
**In short:** Typing a code like "CK-17" in search shows a box at the top of the page saying what that feature is, in a few plain lines.
**What:**
- When the search text is exactly an item code (CK-n, FK-n, GT-n, BL-n…, an idea I-n with its repo, or U-n; case and the dash optional): a box above the results with the code, title, repo, state (Planned / Blocked / Built with version and date / Idea) and its "In short" line (built items: their description line), plus a link to the item.
- Code not found: "No feature has the code CK-999". Normal results stay below.
**Tests:** unit: code detection and lookup across planned, built and ideas; e2e: searching "ck-17" shows the box with the built description; an unknown code shows the not-found line.


## Held (needs the owner's "go"; never built from "build the backlog")
