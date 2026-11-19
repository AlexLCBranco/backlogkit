// Whether one-click moves (BL-11) are set up: both Vercel env vars present. Shared by api/projects.ts (canMove) and
// api/move.ts. Its own .mjs so both functions import it with a file extension, as Node's ES modules need on Vercel.
export const movesEnabled = () => !!(process.env.OWNER_PASSWORD?.trim() && process.env.GITHUB_WRITE_TOKEN?.trim())
