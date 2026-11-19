# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-12 — Board redesign: ideas off the board, Now first, readable titles
The owner finds the board (BL-9) badly designed: Built's 77 rows take over the page, Now is a small box in the middle,
every title is cut off while a quarter of the screen width sits empty, and ideas are mixed in with planned work.
- **Ideas leave the board entirely.** Ideas are not planned work (too complicated for now, or they cost money to run);
  they live only on the Ideas page. The Later column goes away. The board shows planned and built work only.
- **Stacked full-width sections instead of four columns**, top to bottom: Now (`## Ready`), Next (`## Held`), Built
  (last 7 days). The page uses the full width of the screen.
- **Full titles.** Titles wrap (up to 2 lines) instead of being cut off with "…". The title is the brightest text on
  the row; the ID is dimmed so it does not compete with the title.
- **Now** is the most prominent section (larger titles or more padding). Blocked stays a badge.
- **Built** is collapsed by default to one summary line with per-repo counts (e.g. "Built (7 days) — footykit 14 ·
  backlogkit 11"); a click expands it. Expanded, it is grouped by repo, each repo appearing once (not footykit in
  several separate blocks), newest first within a repo.
- **Repo tags:** a small colour dot per repo (one stable colour per repo, with the repo name on hover) instead of the
  grey text pill on every row; no dot at all when the filter shows only one repo.
- **Remove the repeated text:** the "Now 1 · Next 1 · Later 11 · Blocked 1 · Built 77" line above the board (the
  section headers already carry the counts), and "Estimated: — (no estimates yet)" when a section has no estimates.
- **Filter chips:** the selected chips must be obvious at a glance (filled background, not just a thin border).
- Empty sections show one short muted line ("Nothing here"), not an empty box.
- Tests: automated checks that no idea (`I-n`) appears on the board, that the sections are in the order Now, Next, Built,
  that Built is collapsed by default and expands on click, that a long title is not truncated with "…", and that the
  repo dot is hidden when one repo is filtered.

## Held (needs the owner's "go"; never built from "build the backlog")

### BL-11 — One-click moves: idea → Next (Ideas page), Next → Now (board)
Two small "→" buttons, each written straight to that repo's files on GitHub:
- **Ideas page:** on each idea, "→ Next" cuts it from `IDEAS.md`/`UNASSIGNED_IDEAS.md` and adds it at the bottom of
  `## Held` with the next free ID of that repo and a `From I-n` line. (Ideas are not on the board since BL-12.)
- **Board:** on each Next item, "→ Now" moves it from `## Held` to the bottom of `## Ready`.
Never moves anything into Built.
Held because the site is read-only today: this needs a GitHub token with write access to all the owner's repos stored in
Vercel, and the page must be protected so only the owner can click it. The owner decides the token and the protection before "go".
**Estimate:** build ~45–90 min · suite ~1 min
