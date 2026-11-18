# Reports — backlogkit

Claude Code's end-of-run reports, newest first (rules: CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-18 — BL-5, BL-6, BL-7, BL-8

**Built**
- BL-5 — Real logo (v1.3.0): an SVG logo (a ticked list) in the header and as the favicon, in `public/logo.svg`.
  Tests: e2e checks the header logo and favicon load.
- BL-6 — Browser tab title follows the page (v1.4.0): "backlogkit · calendarkit backlog", "· All repos", "· Ideas",
  "· Projects", "· search “…”". Tests: unit for the titles, e2e for switching pages.
- BL-7 — Ideas page (v1.5.0): Ideas tab (`#/ideas`), Unassigned first (new `UNASSIGNED_IDEAS.md`, empty), then each repo
  with ideas, copy buttons, search finds U-n ideas; CLAUDE.md has the Unassigned and "assign U-n to <repo>" rules.
  Tests: unit (parsing: missing, empty, items; loader; page; search), e2e (groups, absent repos, copy, search).
- BL-8 — Time estimates (v1.6.0): Estimate badge on planned items, measured "took" badge on built items, Suite time row
  on project cards (from a `Suite time:` line in each repo's `BUILT.md` header), totals per repo and across all repos;
  rule added to CLAUDE.md. Tests: unit (estimate, took and suite line: present, missing, malformed; totals), e2e.
  Took ~4 min by the clock; full local suite ~0.5 min (unit + typecheck + build + e2e, 24–32 s this run).

**Blocked**: none. **Ideas added**: none.

**Other repos that need the BL-8 rule added to their CLAUDE.md** (repos with list files that backlogkit can read
without a token): gauntlet, statmuse-builder, calendarkit, footykit, rotationkit, selfchat, boardkit, linkkit; plus
any private repos with lists.

**Test by hand**: nothing (all automated).
