# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

## Held (needs the owner's "go"; never built from "build the backlog")

### BL-23 — Build order: what to build first, across every repo
**In short:** A new "Build order" page lists every planned item in the order to build it: round 1 is what can be built now, round 2 is what waits for round 1, and so on.
**What:**
- New place in the header, "Build order". It uses every repo's planned items (Ready only; Held items go in their own pile at the bottom, "Waiting for your go").
- Links between items: the item IDs written in an item's `Blocked:` line, as BL-21 already reads them (`src/waits.ts`). An ID that has shipped is no longer a link. Links cross repos.
- Rounds: round 1 = items that wait for nothing unshipped. Round 2 = items that wait only for round 1 items. And so on. Each round says in plain words what it is ("Build these now", "Build these after round 1").
- Order inside a round: the item that other items wait for the most goes first (count everything down the chain, not only direct waits); ties: shorter build estimate first (BL-8's `**Estimate:**` line; no estimate goes last); then repo name, then ID.
- Each row: ID, title, repo, the "In short" sentence, "Opens: <IDs that wait for it>" and "After: <IDs it waits for>" when there are any. The ID opens the item as elsewhere on the site.
- An item whose named IDs have all shipped but still has its `Blocked:` line is in round 1 with BL-21's green "can be unblocked" note.
- "Needs you" pile, apart from the rounds: items whose `Blocked:` line names no item ID (a question, a permission, a missing source) or names an ID found nowhere. Each shows its `Blocked:` text. Items that wait for a "Needs you" item go under it, indented, never in a round.
- An item that waits for an idea (not planned) is in "Needs you" with "waits for an idea that is not planned yet: <ID>".
- A loop (A waits for B, B waits for A): both go in "Needs you" with "These wait for each other: fix the Blocked lines". Never a crash, never an endless loop.
- A "Copy order" button copies the rounds as plain text (one line per item: round, ID, repo, title).
- The page only shows; it never edits a repo.
- CLAUDE.md, "backlogkit formats", Blocked (same text in every repo): add that every item an item needs first must be written by ID in its `Blocked:` line, also when the line is mainly a question to the owner, because Build order only sees IDs written there.
**Tests:** unit: rounds from a small made-up set (a chain of 3, two items waiting for one, a shipped ID drops the link, cross-repo link); order inside a round (most waited-for first, then estimate, then repo, then ID); no-ID blocked item and its dependents land in "Needs you"; a loop lands in "Needs you" and ends; Held items stay out of the rounds. e2e: the page opens from the header, shows "Build these now", and Copy order copies the same order as on screen.
**Estimate:** build ~40–60 min · suite ~5 min
