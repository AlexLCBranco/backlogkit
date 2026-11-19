# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-14 — Home page: five lanes in plain words, with a number strip on top
**In short:** The home page becomes five clearly named boxes, stuck things first, with big numbers at the top that jump to each box.
**Why:** the owner wants a page anyone understands at a glance (his words: "even a 5 year old"), usability first. Today's
board says Now/Next while the files and buttons say Ready/Held, "Now 5" counts a blocked item that can't be built, and
the Blocked badge is small and far right.
**What:**
- The home page shows five lanes, always in this order and always present (an empty lane shows one muted line, e.g.
  "Nothing stuck."):
  1. **Stuck – needs you**: every planned item with a `Blocked:` line, from Ready or Held. Red-tinted lane.
  2. **Will be built next**: Ready items that are not blocked, per repo in file order.
  3. **Waiting for your OK**: Held items that are not blocked.
  4. **Ideas**: one row per reason group with its count (filled in by BL-17; until then one row "N ideas" linking to
     the Ideas page).
  5. **Done**: the built list (BL-18 makes it "new since your last visit"; until then the last 7 days, open, not folded).
  An item is in exactly one lane; a blocked item is never counted in lanes 2 or 3.
- A number strip at the very top: five big numbers with the lane name under each; clicking one scrolls to its lane.
  The Stuck number has a red background when above 0 and is grey at 0.
- One vocabulary on screen. These lane names replace Now / Next / Ready / Held / Planned in every place the owner reads
  words: lane titles, buttons, tooltips, project cards' counts, tab titles. Buttons: "→ Now" becomes **Give OK**
  (Waiting → Will be built next) and "→ Next" on ideas becomes **Plan it** (idea → Waiting for your OK). The files keep
  their Ready / Held sections; only the screen changes.
- Project filter chips stay, bigger (at least 32 px tall), with an **All projects** chip first; the filter applies to
  the five lanes and the number strip.
- The search box placeholder says "Search everything…" and searches all lanes and ideas, on every page.
**Tests:** unit: lane assignment (blocked in Ready → Stuck, blocked in Held → Stuck, never counted twice, counts per
lane, filter applied); e2e with fixture data: the five lanes in order, strip numbers equal lane counts, clicking a
number scrolls to its lane, an empty lane shows its line, and a text scan of every page finds none of the words Now,
Next, Ready, Held as labels.
**Estimate:** build ~40–60 min · suite ~0.5 min

### BL-15 — Cards anyone can read: plain sentence first, project name instead of a dot
**In short:** Each item shows one plain sentence first, with the project's name written on it instead of a coloured dot.
**What:**
- The shared parser (`lib/lists.mjs`) reads `**In short:** ...` when it is the first non-empty line under an item's
  heading (format: CLAUDE.md, "backlogkit formats") into `item.short`; missing → `null`.
- Card row: project name label, then the In short sentence (full, wrapping), then the ID small and muted at the right.
  Without an In short line the heading title shows instead, followed by a small muted "no summary yet" tag so old specs
  are easy to spot. Clicking a card still unfolds the full spec underneath.
- Project label: the repo's name as text in a neutral chip, the same on every page (home, Ideas, Done, Built). Remove the
  coloured dots: their colours repeat today (backlogkit and calendarkit look the same, so do footykit and gauntlet).
**Tests:** parser unit (with In short, without, In short not the first line → `null`); e2e: a card shows the sentence and
the project name as text, a card without In short shows its title and "no summary yet", no dot element remains.
**Estimate:** build ~20–30 min · suite ~0.5 min

### BL-16 — Stuck items: show the question and answer it from the site
**In short:** Stuck items show exactly what's needed from you, and you can type your answer right there.
**What:**
- In the Stuck lane each card shows, under its sentence, the full text of its `Blocked:` note (the question) in the
  danger colour, plus its date when the note has one.
- An **Answer** button on each stuck card, shown when the owner is unlocked (BL-11's Owner password); when locked the
  card says "Unlock as owner to answer". It opens a text box with Save and Cancel; Save is refused with an inline
  message when the box is empty.
- Save makes one commit to that repo's `FEATURE_BACKLOG.md` on its default branch (new action `answer` in `api/move.ts`,
  same password and write-token checks as BL-11, commit message `backlogkit: answer <ID>`). It replaces the Blocked
  note with one line `**Answered (YYYY-MM-DD):** <the Blocked text as it was> → <the answer>`. The Blocked note is the
  line starting with `Blocked:` (plain or bold, optionally after "- ") through the line before the next line starting
  with `**`, the next heading or the end of the item. If the item has no Blocked note any more, the API refuses and the
  site says "Already answered — reload".
- After a successful save the card leaves the Stuck lane at once and shows in its normal lane (reloaded data).
**Tests:** unit for the replacement (bold and plain Blocked, one and several lines, followed by another `**Field:**`
line, missing note → refused); API test with mocked GitHub (commit content and message); e2e with mocked API: Answer
opens the box, empty Save shows the message, Save sends the right request and the Stuck count drops.
**Estimate:** build ~30–45 min · suite ~0.5 min

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
