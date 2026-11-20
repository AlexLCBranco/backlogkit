# Built — backlogkit

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.
New entries name their backlog ID (see CLAUDE.md, "Feature backlog, built list and ideas").
Suite time: last ~0.6 min (2026-11-20) · longest ~0.6 min (2026-11-20)

## 2026-11-20
- BL-19 — Shared layout: pinned header menu, chips instead of dropdowns (v1.16.0) (took 13 min, suite 0.6 min)
  A header that stays at the top of every page (back / forward, a breadcrumb whose parts jump to their neighbours, "Go anywhere" on Ctrl+K) with four places under it (Home · Projects · Ideas · Built); under it the project chips (What) and, on Projects, the order switches (How) replace the sort dropdown, and every choice is in the address.

## 2026-11-19
- Fix: a selection cleared right after a drag could come back (v1.15.1)
  Clicking empty space (or Esc) just after drawing a selection box now always clears it.
- BL-13 — Marquee selection on the board (v1.15.0) (took 3 min, suite 0.4 min)
  Drag a box over items on the home page to select them (Shift or Ctrl adds more); a bar shows how many are selected with Copy (or Ctrl+C) and Clear, and Esc clears.
- BL-18 — Done: what's new since your last visit (v1.14.0) (took 3 min, suite 0.4 min)
  The Done box says how many things were built since you last looked, one row per project (click to see each item and what changed); Mark all seen clears it, and the Done number turns green while there is something new.
- BL-17 — Ideas grouped by why they're not planned (v1.13.0) (took 4 min, suite 0.4 min)
  The Ideas page and the home Ideas box group ideas into Needs your decision, Waiting on something, Too big, Not important yet, No reason yet and Maybe never (folded); dates and notes sit small under each idea, and after unlocking each idea has a reason dropdown.
- BL-16 — Stuck items: show the question and answer it from the site (v1.12.0) (took 4 min, suite 0.4 min)
  Each stuck item shows its question in red (with its date); after unlocking as owner, Answer opens a box and Save writes the answer into that repo's backlog, so the item leaves Stuck.
- BL-15 — Cards anyone can read: plain sentence first, project name instead of a dot (v1.11.0) (took 3 min, suite 0.4 min)
  Each item shows its project's name and its one-sentence summary first, with the ID small at the right; specs without a summary show their title with a "no summary yet" tag.
- BL-14 — Home page: five lanes in plain words, with a number strip on top (v1.10.0) (took 8 min, suite 0.4 min)
  The home page is now five boxes (Stuck – needs you, Will be built next, Waiting for your OK, Ideas, Done) with big clickable numbers on top, bigger project chips, and buttons named Give OK and Plan it.
- Fix: the site failed to load after v1.9.0 (v1.9.1)
  The project list loads again; v1.9.0's server code had an import that works in tests but not on Vercel.
- BL-11 — One-click moves: idea → Next (Ideas page), Next → Now (board) (v1.9.0) (took 8 min, suite 0.4 min)
  After unlocking with the owner password (Owner, top right), each idea has "→ Next" (unassigned ones pick a repo first) and each Next item "→ Now"; each click is one commit to that repo on GitHub.
- BL-12 — Board redesign: ideas off the board, Now first, readable titles (v1.8.0) (took 5 min, suite 0.4 min)
  The board is now Now, Next and Built stacked full width with no ideas on it; titles wrap in full, repos are colour dots, and Built is one line of per-repo counts until you click it.
- BL-9 — Board home page: Later → Next → Now → Built, across all repos (v1.7.0) (took 6 min, suite 0.3 min)
  The home page is now one board of every repo's ideas, held, ready and last-7-days built items, one line each (click to open), with Blocked badges, counts, project filter chips and an All built page; the project page and All repos view are gone.
- BL-10 — Compact project cards (v1.7.0)
  Each card's details are one line (version · devices · pushed · built, then live site and repo links); suite time and estimates are in the card's tooltip.
### Internal
- CI: the live check waits for this version or a newer one (pushes in a row made it fail when a later push deployed first)
- Logo e2e test waits for the image to load instead of reading it once (it failed on the live site when the logo loaded slowly)

## 2026-11-18
- BL-8 — Time estimates: build time and local test suite time (v1.6.0) (took 4 min, suite 0.5 min)
  Planned cards show their estimate (build and suite), built items their measured time, each project card its last and longest suite run, and Planned shows a total per repo and across all repos.
- BL-7 — Ideas page: every repo's ideas in one place, plus ideas with no repo (v1.5.0)
  A new Ideas tab lists every repo's ideas grouped by repo, each with a copy button, after an Unassigned group read from the new UNASSIGNED_IDEAS.md; search finds those too.
- BL-6 — Browser tab title follows the page (v1.4.0)
  The tab title says what's open: "backlogkit · calendarkit backlog" on a project page, "backlogkit · All repos", "backlogkit · Projects", or the search.
- BL-5 — Real logo (v1.3.0)
  A backlogkit logo (a ticked list) sits beside the name in the header and is the browser tab's icon.

## 2026-11-17
- BL-4 — Sort the project cards (v1.2.0)
  A Sort dropdown above the cards orders each group by backlog changed, last change, created or name (either direction; default backlog changed, newest first), remembered in this browser; each card shows its Backlog changed date.
- BL-3 — Copy buttons: one per feature, one for the whole backlog (v1.1.0)
  Every planned and built item has a small copy icon beside its title that copies it as Markdown (heading and full text), and Planned has one that copies the whole backlog; the icon turns into a checkmark for a moment.
- BL-2 — Move the all-repos built list here from gauntlet (v1.0.0)
  ALL_BUILT.md and the new ALL_BACKLOG.md (every repo's planned items) are now rebuilt here daily from every repo on GitHub; the all-built workflow can also be run by hand from the Actions tab.
- BL-1 — The site: all projects, their backlogs, built lists and ideas in one place (v1.0.0)
  One card per project (description, links, status, devices, last push, version, counts), a page per project with Planned and Built side by side and Ideas folded, an All repos view and search across every item.
