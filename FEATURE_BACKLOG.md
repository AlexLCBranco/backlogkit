# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-9 — Board home page: Later → Next → Now → Built, across all repos
Replace the All repos view with one board as the site's home page. Four columns, left to right:
- **Later**: every repo's `IDEAS.md` items plus `UNASSIGNED_IDEAS.md` (tag "unassigned").
- **Next**: every repo's items under `## Held` in `FEATURE_BACKLOG.md`.
- **Now**: every repo's items under `## Ready` in `FEATURE_BACKLOG.md`.
- **Built**: `BUILT.md` items from the last 7 days, newest first, with an "All built" link at the bottom to the full list.
No repo's file format changes; this is only a new view of the existing sections.
- Each item is one line: project tag, ID, title. Click the line to expand the full spec or sentence in place; click again to close.
- Blocked is not a column or a status: an item with a `Blocked:` note stays in its column with a red "Blocked" badge.
- Column headers show counts. The board header shows one line: `Now N · Next N · Later N · Blocked N · Built (7 days) N`.
- Project filter chips above the board (one per project, plus "All"); selected chips are remembered in this browser.
  Clicking a project card on the Projects tab opens the board filtered to that project. Old project-page URLs open the
  board filtered to that project instead of breaking.
- Within a column, items are grouped by project in the current card sort order, keeping each file's order.
- Search keeps working and searches the board.
- The current per-project page (side-by-side Planned/Built with the ID count line "Planned 1 (Ready 1 / Held 0) · Blocked 1")
  is removed, since it shows Blocked as a count next to Ready for the same item.
- Copy buttons stay on every item (copy shows on hover of the line).
- Tests: board renders the four columns from fixture repos; a Held item lands in Next, a Ready item in Now, an idea in
  Later; a Blocked item shows the badge and is counted once; Built drops items older than 7 days; filter chips and the
  old project URL redirect work.

### BL-10 — Compact project cards
- The metadata block on each project card becomes one line: `v<version> · <devices> · pushed <date> · built <date>`,
  then the live site and repo links. Fields nobody filled in still show as a dash (CLAUDE.md rule).
- "Backlog changed" stays only as the sort key, not as a row. Suite time and estimates move into the card's tooltip.
- Tests: card shows the one-line meta from fixture data; a missing field shows a dash.

## Held (needs the owner's "go"; never built from "build the backlog")

### BL-11 — One-click move between columns on the board
On each board item, a small "→" button moves it one column right (Later → Next → Now), written straight to that repo's
files on GitHub: an idea is cut from `IDEAS.md`/`UNASSIGNED_IDEAS.md` and added at the bottom of `## Held` with the next
free ID of that repo and a `From I-n` line; a Next item moves from `## Held` to the bottom of `## Ready`. Never moves
anything into Built.
Held because the site is read-only today: this needs a GitHub token with write access to all the owner's repos stored in
Vercel, and the page must be protected so only the owner can click it. The owner decides the token and the protection before "go".
