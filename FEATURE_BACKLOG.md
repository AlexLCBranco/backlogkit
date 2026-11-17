# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-3 — Copy buttons: one per feature, one for the whole backlog
Every item row in a project's backlog (planned and built, e.g. "GT-5 Slate step 5: …") gets a small copy icon button
right next to the title, always visible (desktop-first, no hover-only). Clicking copies that item as Markdown: its
heading line (`### GT-5 — title`) plus its full spec text, exactly as in the repo file. Clicking the icon must not
expand/collapse the row. Each project also gets one "copy all" icon button at the top of its backlog that copies the
whole planned list (Ready + Held, with section headings) as Markdown. Feedback: the icon briefly turns into a
checkmark (~1.5 s); no alerts or toasts. Use the Clipboard API; tooltip/aria-label "Copy GT-5" / "Copy whole
backlog". Tests: unit test for the per-item and whole-backlog Markdown output; e2e that clicking copies the expected
text (clipboard permission granted in Playwright) and does not toggle the row.

### BL-4 — Sort the project cards
A sort dropdown above the cards, applied inside each group (Active, etc.). Options:
- Backlog changed — newest first / oldest first (date of the last commit touching `FEATURE_BACKLOG.md`)
- Last change — newest first / oldest first (last push to the repo)
- Created — newest first / oldest first (repo creation date)
- Name — A–Z / Z–A
Default: Backlog changed, newest first. The choice is remembered in the browser (localStorage, wrapped in try/catch).
Show the backlog-changed date on each card ("Backlog changed 2026-11-17"), like Last push. Repos with no backlog file
or an unknown date go last in any date sort. Fetch the new dates server-side with the existing GitHub calls; keep
the number of requests low (works without a token for public repos; say in the report if rate limits are a risk).
Tests: unit test for every sort option including missing dates; e2e that changing the dropdown reorders the cards
and the choice survives a reload.

## Held (needs the owner's "go"; never built from "build the backlog")
