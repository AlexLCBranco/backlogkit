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

### BL-22 — "Paywall" as a sixth reason an idea isn't planned
**In short:** Ideas get a sixth reason, "Paywall" (it needs something that costs money: paid data, a paid API or a paid plan), shown and picked on the site like the other five.
**Why:** Owner, 2026-11-21: "waiting" mixed ideas that unblock by themselves with ideas only money unblocks (footykit's I-15 and I-16, both waiting for paid bookmaker odds).
**What:**
- New tag `[why: paywall]`, valid everywhere the five tags are today: reading `IDEAS.md` and `UNASSIGNED_IDEAS.md`, the Ideas page groups and filters, setting a reason from the site, moves and copies.
- Label on the site: "Paywall". Its one-line explanation: "Needs something that costs money."
- Order of the reasons: waiting, paywall, decision, too-big, later, never.
- Rule text: in this repo's CLAUDE.md, "backlogkit formats", Ideas bullet, add after the `[why: waiting]` part: "`[why: paywall]` needs something that costs money (paid data, a paid API, a paid plan);". The report lists the other repos that need the same sentence (the section is the same text in every repo).
- Do not retag any idea yourself. The report reminds the owner that footykit's I-15 and I-16 are to be retagged to paywall once this is live (the Claude chat does it).
**Tests:** unit: `[why: paywall]` reads as a valid reason, not as an unknown one; it is in the reasons list in the order above; setting an idea's reason to paywall writes `[why: paywall]`. e2e with fixture repos: an idea tagged paywall shows under "Paywall" on the Ideas page, and the site's reason picker offers "Paywall".

## Held (needs the owner's "go"; never built from "build the backlog")
