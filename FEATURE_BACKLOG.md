# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

## Held (needs the owner's "go"; never built from "build the backlog")

### BL-24 — A clearer Stuck section
**In short:** Stuck splits into "Ready to go again" and "Still waiting", each card shows a simple ✓/⏳ checklist instead of a red sentence followed by green ones, and one button sends a ready item back to the plan.

Problems today (owner, 2026-11-23, screenshot of 4 stuck gauntlet items GT-14, GT-16, GT-22, GT-21):
- Each card shows the old red sentence ("waits for footykit FK-76") right above a green one saying FK-76 has shipped.
  Red and green say opposite things on the same card.
- "This can be unblocked" doesn't say what to do. The only button is "Answer", which asks you to type something.
- GT-21 waits for GT-14, which is itself stuck but ready. The card only says "planned in gauntlet", so you can't tell
  that unsticking GT-14 is the next step.
- The header "Stuck – needs you 4 · 3 can be unblocked" packs two ideas into one line.

What changes:
1. Two groups inside Stuck, each with a heading and a count:
   - "Ready to go again (3)" with the line under it: "Everything these waited for is done. Press Unstick to put them back in the plan."
   - "Still waiting (1)" with: "These wait for something that isn't built yet."
   Items whose Blocked note names no other item (pure questions to the owner) go in a third group,
   "Needs your answer (n)": "These need you to decide something. Press Answer." Empty groups are hidden.
2. Header and the top strip: "Stuck 4: 3 ready to go again · 1 still waiting" (only the parts that aren't zero).
3. Each card replaces the red Blocked sentence and the waits lines with a checklist titled "Waits for:", one row per ID:
   - ✓ FK-76 — footykit — built 2026-11-21 (green)
   - ⏳ GT-14 — gauntlet — planned, not built yet (amber)
   - ⏳ X-1 — an idea in <repo>, not planned yet / not found in any project (amber)
   Each row shows the waited item's own "In short" sentence (or its title) in small grey text, so you know what it is
   without searching. If the waited item is itself in "Ready to go again", the row says "is stuck but ready: unstick it
   first" with a link that scrolls to that card. The full original Blocked text moves inside the card's expanded view
   (as "Original note: ..."), so nothing is lost. No red anywhere for things that are fine; red only for "not found".
4. "Unstick" button on every card in "Ready to go again" (owner unlocked; locked shows "Unlock as owner to unstick").
   It opens the existing answer box already filled with
   "Everything it waited for is built: FK-76 (footykit, 2026-11-21)." The owner can edit it, then Save (same commit
   as BL-16's Answer: the Blocked line becomes `**Answered (date):** ...`). The item moves to "Will be built next".
   Pre-filled, not one-click, because a Blocked note can also hold a question the owner must still answer.
5. Ready-to-go-again first, then Still waiting, then Needs your answer. Inside each group the current order stays.
6. Same wording on the Projects page counts (each project's "n can be unblocked" becomes "n ready to go again").

Tests: unit tests for the grouping, header text, checklist rows (shipped / planned / idea / missing / stuck-but-ready),
the prefilled Unstick text; UI test that a card in Ready shows no red text and has Unstick; e2e for the screenshot case.
**Estimate:** build ~20–30 min · suite ~1 min (guess)
