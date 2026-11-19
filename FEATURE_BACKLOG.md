# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

## Held (needs the owner's "go"; never built from "build the backlog")

### BL-11 — One-click move between columns on the board
On each board item, a small "→" button moves it one column right (Later → Next → Now), written straight to that repo's
files on GitHub: an idea is cut from `IDEAS.md`/`UNASSIGNED_IDEAS.md` and added at the bottom of `## Held` with the next
free ID of that repo and a `From I-n` line; a Next item moves from `## Held` to the bottom of `## Ready`. Never moves
anything into Built.
Held because the site is read-only today: this needs a GitHub token with write access to all the owner's repos stored in
Vercel, and the page must be protected so only the owner can click it. The owner decides the token and the protection before "go".
**Estimate:** build ~45–90 min · suite ~1 min
