# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-17 — Ideas grouped by why they're not planned
**In short:** Ideas are sorted into groups that say why each one isn't planned yet, and you can set the reason with one click.
**What:**
- The shared parser reads a reason tag at the end of an idea (`[why: waiting|decision|too-big|later|never]`, format in
  CLAUDE.md, "backlogkit formats") into `idea.why` and removes it from the shown text. An unknown value counts as no
  reason and is listed in `problems`.
- The Ideas page and the home Ideas lane group ideas by reason, in this order and with these names:
  **Needs your decision** · **Waiting on something** · **Too big, needs splitting** · **Not important yet** ·
  **No reason yet** · **Maybe never** (last, folded). Each group shows its count; each idea shows its project label and
  its text. Unassigned ideas (`UNASSIGNED_IDEAS.md`) are included with an "Unassigned" label.
- Cleaner text: a parenthesised note at the very end of an idea (e.g. `(PLAN.md "Later list")`, `(same source)`,
  `(2026-10-16, chat)`) shows small and muted on a line under the idea instead of inline.
- When the owner is unlocked, each idea has a small reason dropdown (the six groups; "No reason yet" removes the tag).
  Choosing one makes one commit to that repo's `IDEAS.md` (or `UNASSIGNED_IDEAS.md`) adding or replacing the tag
  (new action `reason`, same checks as BL-11, commit message `backlogkit: reason <ID> <why>`). **Plan it** stays.
- Home Ideas lane: one row per non-empty group with its count and its first idea's text; clicking a row opens the Ideas
  page at that group.
**Tests:** parser unit (each tag, no tag, unknown tag, tag on a continued indented line, end note split off); grouping
order and counts; API unit for adding and replacing a tag; e2e with fixtures: group headings in order with counts, the
dropdown sends the right request.
**Estimate:** build ~40–60 min · suite ~0.5 min

### BL-18 — Done: what's new since your last visit
**In short:** The Done box shows what got built since you last looked, grouped by project, with what you'll see in each app.
**What:**
- New means: a built item from the last 30 days whose key (repo + ID, or repo + title + version for items without an ID)
  is not in the "seen" list kept in this browser (localStorage, wrapped in try/catch). On the first visit everything from
  the last 7 days counts as new.
- Done lane: heading "N new since you last looked" (or "Nothing new" with the last 7 days' count). One row per project
  with new items: project label, count, newest item's line. Clicking a row unfolds that project's new items, each as its
  title with version and, under it, its "what you'll see" sentence from `BUILT.md`. `### Internal` entries are left out.
- **Mark all seen** adds every item currently shown as new to the seen list; it is never done automatically (a reload
  doesn't lose anything). A link **Everything built** goes to the full Built page.
- The number strip's Done number shows the new count when above 0 and is green.
**Tests:** unit with fixed dates (new vs seen vs older than 30 days, Internal excluded, first-visit rule); e2e: new items
grouped by project, Mark all seen empties the list and it stays empty after reload.
**Estimate:** build ~25–40 min · suite ~0.5 min

### BL-13 — Marquee selection on the board
**In short:** Drag a box over items to pick several at once and copy them.
**What:** marquee selection on backlogkit, with the same rules as the owner's other apps (calendarkit / footykit / gauntlet apps): drag on empty space to draw a box; every item line it touches is selected (highlighted); Shift or Ctrl + drag adds to the selection; click on empty space or Esc clears; a plain click on an item still opens it (no drag = no selection). Controls, chips and links never start a marquee (`data-no-marquee`). While something is selected, a small bar shows "N selected · Copy · Clear"; Copy (and Ctrl+C) copies the selected items as text in the same format as backlogkit's existing copy, in board order, grouped by project.
**Tests:** unit: hit-testing the box against item rects, add-with-modifier, clear; e2e: drag selects the right items, click still opens an item, Esc clears, copied text matches the existing format.
**Estimate:** build ~30–45 min · suite ~0.5 min

## Held (needs the owner's "go"; never built from "build the backlog")
