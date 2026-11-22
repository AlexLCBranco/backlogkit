# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-21 — Stuck items say when the thing they wait for has shipped
**In short:** A stuck item that waits for another project's item (like footykit's FK-61 waiting for halftime-timer's HT-1) shows "HT-1 has shipped: this can be unblocked" as soon as that item is built, and goes to the top of the Stuck list.
**Why:** Top priority (owner, 2026-11-21). FK-61 stayed stuck after HT-1 shipped: its note said "the owner unblocks it once HT-1 ships", nothing checked, and the owner had to notice by himself.
**What:**
- For every planned item with a `Blocked:` line, in every repo: find each item ID written in that line (letters, a dash, a number, e.g. `HT-1`), leaving out the item's own ID.
- Look each ID up in every repo's lists, which the site already reads.
- Every named ID is in a `BUILT.md`: the card shows "HT-1 has shipped (halftime-timer, <the day it is listed under>): this can be unblocked", in a colour different from the other stuck cards, and these cards come first in "Stuck – needs you".
- Some named IDs shipped and some not: say which have shipped and which have not. The card stays in its normal place.
- A named ID is still planned: "Still waiting for HT-1 (planned in halftime-timer)".
- A named ID is in no list of any repo: "HT-9 was not found in any project".
- A `Blocked:` line with no ID in it: nothing changes.
- The site only shows this. It never edits a repo by itself.
- The count of "can be unblocked" items shows wherever the count of stuck items shows today.
- Rule text: add this sentence to the "Blocked" bullet of "backlogkit formats" in this repo's CLAUDE.md: "When an item waits for another item (in this repo or another), write that item's ID in the `Blocked:` line; backlogkit then says when it has shipped." The report lists the other repos that need the same sentence (the section is the same text in every repo).
**Tests:** unit: IDs found in a Blocked line (own ID left out, none, one, several); each case above (all shipped, some shipped, still planned, not found, no ID) gives the right text; shipped ones sort first. e2e with fixture repos: a stuck item naming a built ID shows the "can be unblocked" text and is first in the Stuck list.

## Held (needs the owner's "go"; never built from "build the backlog")
