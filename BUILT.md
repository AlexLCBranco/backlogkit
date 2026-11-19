# Built — backlogkit

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.
New entries name their backlog ID (see CLAUDE.md, "Feature backlog, built list and ideas").
Suite time: last ~0.3 min (2026-11-19) · longest ~0.5 min (2026-11-18)

## 2026-11-19
- BL-9 — Board home page: Later → Next → Now → Built, across all repos (v1.7.0) (took 6 min, suite 0.3 min)
  The home page is now one board of every repo's ideas, held, ready and last-7-days built items, one line each (click to open), with Blocked badges, counts, project filter chips and an All built page; the project page and All repos view are gone.
- BL-10 — Compact project cards (v1.7.0)
  Each card's details are one line (version · devices · pushed · built, then live site and repo links); suite time and estimates are in the card's tooltip.
### Internal
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
