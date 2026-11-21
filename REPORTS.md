# Reports — backlogkit

Claude Code's end-of-run reports, newest first (rules: CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-21 — BL-20

**Built**
- BL-20 — Searching a feature code explains it at the top (v1.17.0). A search that is exactly a code shows a box
  above the five lanes: code, title, Project, State (Planned / Blocked / Built · version · date / Idea), In short
  (built items: their description line; nobody wrote one: a dash; ideas: no such line) and a link. An unknown code:
  "No feature has the code CK-999". The normal results stay below.

**Decided without the spec saying** (say if you want any changed)
- "An idea I-n with its repo": both ways work. "demo I-2" or "I-2 demo" shows that repo's idea; "I-2" alone shows
  one box entry per repo that has an I-2 (only the chosen projects' when chips are on and they have one).
- "The dash optional" ("ck17") only counts when the letters are a prefix some item really uses, so a word like "ps5"
  stays an ordinary search. With the dash, any code counts ("XX-999" → the not-found line).
- "A link to the item" opens the file it is written in on GitHub (planned: straight to its heading in
  `FEATURE_BACKLOG.md`; built: `BUILT.md`; ideas: `IDEAS.md` / `UNASSIGNED_IDEAS.md`). Items have no page of their own
  on the site.
- A built item's title in the box drops its "(v1.3.0)" ending, since the State line says the version.
- BL-20 had no `**Estimate:**` line; none was added because it shipped in the same run (took 9 min, suite 0.6 min).

**Also fixed:** CI on main was red since the 2026-11-20 backlog commit: a unit test read the real
`UNASSIGNED_IDEAS.md` and expected it empty, and it now has U-1 and U-2. The test uses its own header-only text now.

**Tests:** 184 unit + 32 e2e pass locally (suite 0.6 min). New: `tests/code.test.ts` (detection and lookup across
planned, built, ideas), four page tests, and the e2e ("ck-17" shows the box with the built description; "CK-999"
shows the not-found line). One old e2e line changed: it assumed the oldest built day in the fixture was zulu's.

**Blocked:** none. **Ideas added:** none.
**Test by hand:** nothing needed; only whether the box reads well to you.

## 2026-11-20 — BL-19

**Built**
- BL-19 — Shared layout (v1.16.0), following NAV_PATTERN.md with footykit FK-65's header styles copied (FK-65 had
  shipped). Pinned header on every page: logo, ← → (this tab's own trail, with "Back to …" tooltips), breadcrumb
  (each part opens its neighbours), "Go anywhere" (Ctrl+K: pages, projects, idea groups, any item or idea by ID, or
  "Search everything for …"), the read time and Owner button. Accent colour now footykit's blue.
- **Where mapping (please check):** Home (all backlogs, the five lanes) · Projects · Ideas · Built. There is no
  Reports page on the site, so no tab for it.
- **What / How:** the project chips are the What row on Home, Ideas and Built (Ideas and Built can now be filtered by
  project too). On Projects, the sort dropdown became two How switches: Backlog changed / Last change / Created /
  Name, then Newest first / Oldest first (A–Z / Z–A for Name).
- **Every state in the address:** `#/?p=alpha,demo`, `#/ideas/later?p=demo`, `#/projects?sort=name-asc`, `#/?q=…`.
  Old `#/p/<repo>` and `#/all` still open. Change you'll notice: the chosen projects are no longer remembered by the
  browser separately — opening the bare address shows All projects (so a shared link always shows the same screen).
  The sort order is still remembered for Home's grouping.
- The old always-on search box is gone from the header (the pattern has "Go anywhere" there); a search shows an
  editable Search field with × in the page rows.
- Kept as dropdowns on purpose: the Ideas page's per-idea "reason" and "to repo…" pickers (owner actions, not choices
  of what's shown).

**Tests:** 169 unit + 31 e2e pass locally (suite 0.6 min). New `e2e/nav.spec.ts` covers NAV_PATTERN §6: header on
every page, same height, pinned after scroll; every tab / chip / switch / breadcrumb part navigates and reloads to the
same screen; ← → and browser back/forward; Go anywhere; clicks < 100 ms; layout shift < 0.01; no What dropdowns,
every icon-only control named; 390 px fits with no sideways scroll; screenshots of each page (desktop and 390 px).

**Blocked:** none. **Ideas added:** none.
**Test by hand:** only the look — whether it reads as one site with footykit.

## 2026-11-19 — BL-14, BL-15, BL-16, BL-17, BL-18, BL-13

**Built** (each its own commit and version, live after each push)
- BL-14 — Home page as five lanes (v1.10.0): Stuck – needs you (red), Will be built next, Waiting for your OK, Ideas,
  Done, always in that order, with five big clickable numbers on top. Buttons are now **Give OK** and **Plan it**;
  Now/Next/Ready/Held/Planned are gone from the screen (an e2e scan checks every page). Chips are 34 px with
  **All projects** first; the search box says "Search everything…".
- BL-15 — Cards anyone can read (v1.11.0): project name, then the `**In short:**` sentence, ID small at the right;
  specs without one show their title and "no summary yet". No coloured dots anywhere.
- BL-16 — Answer stuck items (v1.12.0): the Blocked question shows in red with its date; after unlocking, **Answer**
  → Save commits `**Answered (date):** <question> → <answer>` (`backlogkit: answer <ID>`) and the item leaves Stuck.
- BL-17 — Ideas by reason (v1.13.0): six groups (Maybe never last, folded), notes like dates shown small under the
  idea, a reason dropdown for the owner (`backlogkit: reason <ID> <why>`), one row per group on Home linking to it.
  Unknown `[why: …]` values show under "No reason yet" and in the site's warnings.
- BL-18 — Done: new since your last visit (v1.14.0): "N new since you last looked", one row per project (click to
  unfold), **Mark all seen**, green Done number while something is new. First visit = last 7 days.
- BL-13 — Marquee selection (v1.15.0): drag a box to select items; Shift/Ctrl adds; Esc or a click on empty space
  clears; "N selected · Copy · Clear"; Copy/Ctrl+C copies the items' Markdown grouped by project under `## <repo>`.

Tests: 154 unit + 22 e2e, all passing; full local suite ~0.4 min (26 s).

**Decided without the spec saying** (say if you want any changed)
- The top-bar link and tab title say "Home" instead of "Board".
- Stuck items have no Give OK (they need an answer first); "Unlock as owner to answer" shows only when moves are set
  up on the server.
- Unassigned ideas count in the Ideas lane only under All projects. While searching, the Ideas lane lists the matching
  ideas and Done lists matching built items from every day.
- Answers are put on one line, at most 2000 characters, dated with the server's (UTC) date.
- Planning a tagged idea drops its `[why: …]` tag. Empty reason groups show "None." with 0. The per-repo "Copy all"
  buttons on the Ideas page are gone (each idea keeps its copy button).
- The Done number shows the new count (grey 0 when nothing is new). Mark all seen marks what is shown, so with a
  project filter on, only that project's items.
- A marquee can also start on an item line (as in calendarkit); a plain click on an item opens it and keeps the
  selection.

**Internal**: CI's live check failed on the BL-14 push (it waited for exactly v1.10.0 while the BL-16 push had already
deployed v1.12.0). It now accepts this version or a newer one (`scripts/wait-live.ts`, with a test).
CI then caught a real BL-13 bug the local runs had missed (about 1 run in 4): right after a drag, a click that cleared
the selection could be undone a moment later by an update still queued from the drag. Fixed in v1.15.1 with a test
that failed on the old code.

**Blocked**: none. **Ideas added**: none.

**Test by hand**: nothing required. Only feel: try a marquee drag and the Answer box on the live site.

## 2026-11-19 — BL-11

**Built**
- BL-11 — One-click moves (v1.9.0). Your choices: a new fine-grained token `GITHUB_WRITE_TOKEN` for writes (the read
  token is untouched) and an owner password `OWNER_PASSWORD`. "Owner" in the top bar asks for the password once
  (checked by the server, kept in that browser; click "Owner ✓" to lock). Then the Ideas page has "→ Next" on each idea
  (cut from IDEAS.md / UNASSIGNED_IDEAS.md, added at the bottom of `## Held` with the repo's next free ID and a
  `From I-n (date)` line) and the board has "→ Now" on each Next item (Held → bottom of Ready, spec unchanged). Each
  click is one commit on the repo's default branch; if the branch moved meanwhile it reads again and retries, never
  forces. Nothing ever goes into Built. Without both env vars the site shows no buttons and /api/move answers 503.
  Tests: unit (text edits, ID numbering, CRLF kept, refusals), API against an in-memory GitHub (password, one commit,
  retry on a moved branch, unassigned → repo, token never in answers), UI and e2e (hidden until unlocked, wrong
  password, both moves, lock), and a live check that /api/move refuses without the password. ~8 min by the clock;
  full local suite ~0.4 min (23 s).

**Decided without the spec saying**: an unassigned idea gets a repo picker next to its button ("that repo" has no
answer otherwise); the idea's date goes on the From line; the next ID is one more than the highest of the repo's
prefix in FEATURE_BACKLOG.md or BUILT.md, and a repo with no IDs yet is refused rather than given an invented prefix;
an unassigned move is two commits (target repo first, so a failure leaves the idea in both places, never lost, and
says so).

**Follow-up fix (v1.9.1)**: v1.9.0 took the live site down ("Could not load projects") for about 15 minutes:
api/projects.ts imported ./move without a file extension, which Vite and Vitest accept but Node on Vercel does not.
Fixed, and a new test loads every function under plain Node (it fails on the v1.9.0 code).

**Blocked**: none. **Ideas added**: none.

**You must do by hand** (needs your logins): create the fine-grained token (all repos, Contents: read and write) and
add `GITHUB_WRITE_TOKEN` and `OWNER_PASSWORD` in Vercel → backlogkit → Settings → Environment Variables, then redeploy.

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
