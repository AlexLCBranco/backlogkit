# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-13 — Marquee selection on the board
**In short:** Drag a box over items to pick several at once and copy them.
**What:** marquee selection on backlogkit, with the same rules as the owner's other apps (calendarkit / footykit / gauntlet apps): drag on empty space to draw a box; every item line it touches is selected (highlighted); Shift or Ctrl + drag adds to the selection; click on empty space or Esc clears; a plain click on an item still opens it (no drag = no selection). Controls, chips and links never start a marquee (`data-no-marquee`). While something is selected, a small bar shows "N selected · Copy · Clear"; Copy (and Ctrl+C) copies the selected items as text in the same format as backlogkit's existing copy, in board order, grouped by project.
**Tests:** unit: hit-testing the box against item rects, add-with-modifier, clear; e2e: drag selects the right items, click still opens an item, Esc clears, copied text matches the existing format.
**Estimate:** build ~30–45 min · suite ~0.5 min

## Held (needs the owner's "go"; never built from "build the backlog")
