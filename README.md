# backlogkit

All of my projects in one place: what each one is, where it lives, and what is planned, built and in the ideas list.
See `FEATURE_BACKLOG.md` for what is being built.

## How it works

- `projects.json` (hand-edited, read live from `main`): description, live URL, status, devices per repo. `null` shows as a dash.
- `api/projects.ts` (Vercel function) reads GitHub on each visit (cached about a minute): every repo of AlexLCBranco and its
  `FEATURE_BACKLOG.md`, `BUILT.md` and `IDEAS.md`. Token: Vercel env var `GITHUB_TOKEN` (server side only).
- `api/move.ts` (BL-11): the owner's one-click moves (idea → Next on the Ideas page, Next → Now on the board), one commit
  each on the repo's default branch. Off unless both Vercel env vars are set: `GITHUB_WRITE_TOKEN` (fine-grained, all
  repos, Contents: read and write) and `OWNER_PASSWORD` (typed once under "Owner" in the top bar, kept in that browser).
- `lib/lists.mjs` is the one parser for the three lists (shared with the all-repos generator).
- `scripts/all-built.mjs` writes `ALL_BUILT.md` (every repo's built list, by day) and `ALL_BACKLOG.md` (every repo's
  planned items, by repo), daily and on demand from the `all-built` workflow. Secret `ALL_BUILT_TOKEN` (fine-grained,
  Contents: read) lets it read private repos too.
- `npm test` (unit, mocked GitHub), `npx playwright test` (built site, mocked API), `LIVE_URL=https://… npx playwright test` (live).
