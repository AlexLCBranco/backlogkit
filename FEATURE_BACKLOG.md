# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-2 — Move the all-repos built list here from gauntlet
gauntlet's `scripts/all-built.mjs`, its daily workflow `.github/workflows/all-built.yml` and its output `ALL_BUILT.md`
are cross-repo tooling and belong here. Move them to this repo (same daily schedule and on-demand run, same
`ALL_BUILT_TOKEN` secret, which the owner must add here: say so in the report), use the repo list from GitHub /
`projects.json` instead of the hard-coded `REPOS`, and also write `ALL_BACKLOG.md` (every repo's planned items, by
repo). Then, in a separate PR on gauntlet, delete the three files there and point any mention of them to backlogkit.
Do this only after BL-1, so the parser is shared with the site. Tests: the generator's output for mocked repos.

### BL-3 — Copy buttons: one per feature, one for the whole backlog
Every item row in a project's backlog (planned and built, e.g. "GT-5 Slate step 5: …") gets a small copy icon button
right next to the title, always visible (desktop-first, no hover-only). Clicking copies that item as Markdown: its
heading line (`### GT-5 — title`) plus its full spec text, exactly as in the repo file. Clicking the icon must not
expand/collapse the row. Each project also gets one "copy all" icon button at the top of its backlog that copies the
whole planned list (Ready + Held, with section headings) as Markdown. Feedback: the icon briefly turns into a
checkmark (~1.5 s); no alerts or toasts. Use the Clipboard API; tooltip/aria-label "Copy GT-5" / "Copy whole
backlog". Tests: unit test for the per-item and whole-backlog Markdown output; e2e that clicking copies the expected
text (clipboard permission granted in Playwright) and does not toggle the row.

## Held (needs the owner's "go"; never built from "build the backlog")
