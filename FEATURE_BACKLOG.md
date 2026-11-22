# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

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
**Estimate:** build ~10 min · suite ~1 min

## Held (needs the owner's "go"; never built from "build the backlog")
