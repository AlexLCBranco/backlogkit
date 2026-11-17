# Feature backlog — backlogkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are BL-1, BL-2, ... (never reused; BL is this repo's prefix, unique across the owner's repos).

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line). Everything automatable is tested automatically; no manual checklists.

## Ready

### BL-1 — The site: all projects, their backlogs, built lists and ideas in one place
A small website, its own Vercel project (say the final URL in the report), where the owner can quickly review every
project he has. Desktop only.
- Projects come from two sources, merged per repo:
  - `projects.json` in this repo (hand-edited): one-line description, live URL, status (active / paused / retired),
    devices (desktop / mobile). A `null` field shows as a dash, never a guess.
  - GitHub, read live, server side, through a Vercel function, on every visit (cache about a minute): every repo of
    AlexLCBranco, its link, public/private, last push date, and its `FEATURE_BACKLOG.md`, `BUILT.md` and `IDEAS.md`
    when present. A repo on GitHub but not in `projects.json` still shows (with dashes); an entry in `projects.json`
    whose repo does not exist shows a warning.
  - Token from a Vercel env var (name it in the report) so private repos work; never sent to the browser.
- Home page: one card per project, active first, then paused, then retired. Each card: name, description, status,
  live-site link and repo link, devices, last push, latest version (from the newest `BUILT.md` line that has one),
  date of the latest built item, and counts: planned (Ready / Held), blocked, ideas. Repos without any of the three
  files are grouped at the bottom as "No backlog files".
- Project page (click a card): the card's info on top, then **Planned** and **Built** side by side, never mixed, and
  **Ideas** in a collapsed section below.
  - Planned keeps the backlog's own sections (Ready, Held, ...). Each item shows ID and title; click to expand its full
    text. Items with a `Blocked:` note are marked.
  - Built: newest day first, as in `BUILT.md`; "### Internal" left out (same rule as gauntlet's
    `scripts/all-built.mjs`; one parser, shared, not two).
- An "All repos" view: every planned item of every repo in one list (grouped by repo), and every built item by day,
  newest first, like `ALL_BUILT.md`.
- A search box (top bar, every page): filters items across all repos by text or ID.
- A repo that can't be read (no access, error) shows its reason instead of silently missing.
- Owner step the report must spell out: how to create the token (fine-grained, read-only Contents and Metadata on all
  repos) and where to set it in Vercel. Until it is set, the site shows public repos and lists private ones as unread.
Tests (automated, mocked GitHub): parsing of a backlog with sections, multi-line items and a Blocked note; built days
newest first with Internal skipped; ideas; projects.json merge (missing entry, unknown repo, null fields); an
unreadable repo shown with its reason; search; the token never appears in pages or responses.

### BL-2 — Move the all-repos built list here from gauntlet
gauntlet's `scripts/all-built.mjs`, its daily workflow `.github/workflows/all-built.yml` and its output `ALL_BUILT.md`
are cross-repo tooling and belong here. Move them to this repo (same daily schedule and on-demand run, same
`ALL_BUILT_TOKEN` secret, which the owner must add here: say so in the report), use the repo list from GitHub /
`projects.json` instead of the hard-coded `REPOS`, and also write `ALL_BACKLOG.md` (every repo's planned items, by
repo). Then, in a separate PR on gauntlet, delete the three files there and point any mention of them to backlogkit.
Do this only after BL-1, so the parser is shared with the site. Tests: the generator's output for mocked repos.

## Held (needs the owner's "go"; never built from "build the backlog")
