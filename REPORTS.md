# Reports — backlogkit

Claude Code's end-of-run reports, newest first (rules: CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-19 — BL-12

**Built**
- BL-12 — Board redesign (v1.8.0): the board is Now, Next, Built stacked full width (Later and every idea gone; ideas
  only on the Ideas page, and search no longer finds them on the board). Titles wrap (up to 2 lines), are the brightest
  text on the row, IDs dimmed; Now has bigger titles and a highlighted border. Repos are colour dots (stable hue from
  the repo name, name on hover), hidden when one repo is filtered. Built is one line, e.g. "Built (7 days) 5 — demo 4 ·
  zulu 1", and opens on click grouped by repo (most items first, newest first within). Summary line and "no estimates
  yet" removed; selected chips are filled with the accent colour; empty sections say "Nothing here" without a box.
  Tests: unit (order, no ideas, dots, Built fold/groups/counts, empty sections, filter) and e2e (stacked full width,
  long title wraps unclipped at 700 px, Built collapsed/expands, dot colours stable and hidden on one repo, filled chips,
  Now larger, title brighter than ID). ~5 min by the clock; full local suite ~0.4 min (21 s).

**Decided without the spec saying**: while searching, Built opens by itself so matches are visible; repo groups in
Built and the collapsed counts are ordered by item count (as in the spec's example); rows inside a Built repo group
have no dot (the group heading has it); a title longer than 2 lines at the current width still ends in "…" until opened
(the spec's "up to 2 lines"). No estimate line was added to BL-12 since it shipped in the same commit.

**Blocked**: none. **Ideas added**: none. **Test by hand**: nothing (whether the new layout feels right is your call).

## 2026-11-19 — BL-9, BL-10

**Built**
- BL-9 — Board home page (v1.7.0): `#/` is now a board with Later (every IDEAS.md + Unassigned), Next (Held), Now
  (Ready) and Built (last 7 days, "All built" link to a new `#/built` page). One line per item (tag, ID, title), click
  to open in place, red Blocked badge, column counts and the summary line, project chips remembered in this browser,
  grouped by the Projects sort order. Project cards, Ideas-page repo links and old `#/p/<repo>` URLs open the board
  filtered to that repo; `#/all` opens the board. Project page and All repos view removed. Copy shows on hover.
  Search now filters the board from any page; while searching, Built looks through every day, not just 7.
  Estimates: item badge when opened, and a total under Now and Next.
- BL-10 — Compact project cards (v1.7.0): one line `v… · devices · pushed … · built …` then live site and repo
  links; Backlog changed row gone (still the sort key); suite time and estimate total in the card's tooltip.
  Tests: unit (columns, placement, Blocked counted once, 7-day cutoff, chips + storage, old URLs, search, card meta,
  dashes, tooltip), e2e (the same in a real browser with a fixed clock, copy on hover, sort order shared with the board).
  Both built together: ~6 min by the clock; full local suite ~0.3 min (16 s).

**Decided without the spec saying**: project cards still show "Planned N (Ready / Held) · Blocked N"; Unassigned ideas
have no chip (shown under All only); BL-11's estimate line is a guess.

**CI**: two runs failed installing Playwright (Ubuntu package mirror timed out on GitHub's runner), fixed by a re-run;
the live job then failed the logo test, a race (it read the image once, before a slow load); it now waits, and the
local run serves the logo slowly so the old check fails there.

**Blocked**: none. **Ideas added**: none. **Test by hand**: nothing.

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
