# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-19 — Shared layout: pinned header menu, chips instead of dropdowns
**In short:** backlogkit gets the shared layout every app now uses: a header always at the top (back/forward, breadcrumb, main places, "Go anywhere" search), and under it "What" chips and a "How" switch, so nothing is hidden in dropdowns.
**What:**
- Follow [NAV_PATTERN.md](https://github.com/AlexLCBranco/backlogkit/blob/main/NAV_PATTERN.md) exactly (read it first; it is the spec). Same look as footykit FK-65 so the apps read as one site; if FK-65 has shipped, copy its header styles rather than re-designing.
- Where tabs from the site's real pages (projects, all backlogs, all built, ideas, reports, as they exist); projects become What chips. Flag the mapping in the report.
- Replace every `<select>` used to pick what's shown with chips/strips. Every state in the URL; old URLs keep working.
**Tests:** as in NAV_PATTERN.md section 6.

## Held (needs the owner's "go"; never built from "build the backlog")
