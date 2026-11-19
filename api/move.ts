// POST /api/move: the one-click moves (BL-11), written straight to the repo's files on GitHub.
//   { action: "check" }                                   → is the owner password right?
//   { action: "idea", repo, id: "I-n" }                   → IDEAS.md idea → bottom of that repo's "## Held"
//   { action: "idea", repo, id: "U-n", from: "unassigned" } → UNASSIGNED_IDEAS.md (here) → bottom of repo's "## Held"
//   { action: "ready", repo, id: "XX-n" }                 → "## Held" item → bottom of "## Ready"
// Only the owner: every request needs the header x-owner-password matching the Vercel env var OWNER_PASSWORD. Writes
// use GITHUB_WRITE_TOKEN (fine-grained, Contents: read and write on the owner's repos); the read-only GITHUB_TOKEN of
// /api/projects is never used here. Without both env vars moves are off (503) and the site shows no buttons.
// Answers the changed repos' parsed lists, so the page updates without waiting for /api/projects' cache.
import { createHash, timingSafeEqual } from 'node:crypto';
import { FILES, SELF, UNASSIGNED } from '../lib/github.mjs';
import { makeWriter, type Head } from '../lib/github-write.mjs';
import { ID_RE, MoveError, cutIdea, heldToReady, ideaToHeld } from '../lib/moves.mjs';
import { counts, parseBacklog, parseIdeas } from '../lib/lists.mjs';
import { movesEnabled } from '../lib/moves-env.mjs';

const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const TRIES = 3;
export const FAIL_DELAY_MS = 400;

export { movesEnabled };

const digest = (s: string) => createHash('sha256').update(s).digest();
export function passwordOk(given: string | null): boolean {
  const want = process.env.OWNER_PASSWORD?.trim();
  if (!want || !given) return false;
  return timingSafeEqual(digest(given), digest(want));
}

const reply = (status: number, body: object) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export interface MoveRequest { action: 'check' | 'idea' | 'ready'; repo?: string; id?: string; from?: 'unassigned' }
export interface RepoUpdate { repo: string; planned?: ReturnType<typeof parseBacklog>; ideas?: ReturnType<typeof parseIdeas>; counts?: ReturnType<typeof counts> }
export interface MoveAnswer { ok: true; message: string; newId?: string; updates: RepoUpdate[]; unassigned?: ReturnType<typeof parseIdeas> }

/** Reads, edits and commits; when the branch moved meanwhile (GitHub answers 409/422) it starts again from a fresh read. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (i >= TRIES || !(status === 409 || status === 422)) throw e;
    }
  }
}

export async function move(req: MoveRequest, { token, fetchImpl = fetch }: { token: string; fetchImpl?: typeof fetch }): Promise<MoveAnswer> {
  const { action, repo, id, from } = req;
  if (action !== 'idea' && action !== 'ready') throw new MoveError('Unknown action');
  if (!repo || !REPO_RE.test(repo)) throw new MoveError('No valid repo given');
  if (!id || !ID_RE.test(id)) throw new MoveError('No valid ID given');
  const gh = makeWriter({ token, fetchImpl });
  const projectUpdate = (r: string, backlog: string | null, ideas: string | null): RepoUpdate => {
    const planned = parseBacklog(backlog ?? '');
    const list = parseIdeas(ideas ?? '');
    return { repo: r, planned, ideas: list, counts: counts(planned, list) };
  };

  if (action === 'ready') {
    return withRetry(async () => {
      const head = await gh.head(repo);
      const [backlog, ideas] = await Promise.all([gh.file(repo, FILES.backlog, head.sha), gh.file(repo, FILES.ideas, head.sha)]);
      const out = heldToReady({ backlog, id });
      await gh.commit(repo, head, { [FILES.backlog]: out.backlog }, `Backlog: ${id} Held → Ready (backlogkit one-click move)`);
      return { ok: true, message: `${id} moved to Now (Ready) in ${repo}`, updates: [projectUpdate(repo, out.backlog, ideas)] };
    });
  }

  const unassigned = from === 'unassigned';
  if (unassigned !== id.startsWith('U-')) throw new MoveError(unassigned ? 'Unassigned ideas have U IDs' : 'Repo ideas have I IDs');
  const source = { repo: unassigned ? SELF : repo, path: unassigned ? UNASSIGNED : FILES.ideas };
  const sameRepo = source.repo.toLowerCase() === repo.toLowerCase();

  // Target repo first: read its backlog, built list and (same repo) the idea's file at one commit.
  let srcHead: Head | null = null;
  const result = await withRetry(async () => {
    const targetHead = await gh.head(repo);
    const [backlog, built, ideasFile] = await Promise.all([
      gh.file(repo, FILES.backlog, targetHead.sha),
      gh.file(repo, FILES.built, targetHead.sha),
      gh.file(repo, FILES.ideas, targetHead.sha),
    ]);
    let ideasText = sameRepo ? (source.path === FILES.ideas ? ideasFile : await gh.file(repo, source.path, targetHead.sha)) : null;
    if (!sameRepo) {
      srcHead = await gh.head(source.repo);
      ideasText = await gh.file(source.repo, source.path, srcHead.sha);
    }
    if (ideasText === null) throw new MoveError(`${source.repo} has no ${source.path}`);
    const out = ideaToHeld({ ideasText, ideaId: id, backlog, built });
    const message = `Backlog: ${id} → ${out.id} (Held) (backlogkit one-click move)`;
    const files: Record<string, string> = { [FILES.backlog]: out.backlog };
    if (sameRepo) files[source.path] = out.ideas;
    await gh.commit(repo, targetHead, files, message);
    return { out, message, ideasFile: sameRepo && source.path === FILES.ideas ? out.ideas : ideasFile };
  });

  const answer: MoveAnswer = {
    ok: true,
    message: `${id} added to Next (Held) in ${repo} as ${result.out.id}`,
    newId: result.out.id,
    updates: [projectUpdate(repo, result.out.backlog, result.ideasFile)],
  };
  if (unassigned && sameRepo) answer.unassigned = parseIdeas(result.out.ideas);
  if (!sameRepo) {
    // Second repo (UNASSIGNED_IDEAS.md here): the idea is already in the target's Held, so a failure now leaves it in
    // both places, never in neither. Say so plainly.
    try {
      await withRetry(async () => {
        const head = srcHead ?? (await gh.head(source.repo));
        srcHead = null; // a retry reads again
        const text = await gh.file(source.repo, source.path, head.sha);
        if (text === null) throw new MoveError(`${source.repo} has no ${source.path}`);
        const cut = cutIdea(text, id).ideas;
        await gh.commit(source.repo, head, { [source.path]: cut }, `Ideas: ${id} → ${repo} ${result.out.id} (backlogkit one-click move)`);
        answer.unassigned = parseIdeas(cut);
      });
    } catch (e) {
      throw new MoveError(`${id} was added to ${repo} as ${result.out.id}, but could not be removed from ${source.path}: ${e instanceof Error ? e.message : e}. Remove it by hand.`);
    }
  }
  return answer;
}

export async function POST(request: Request): Promise<Response> {
  const token = process.env.GITHUB_WRITE_TOKEN?.trim();
  if (!movesEnabled() || !token) return reply(503, { error: 'Moves are off: OWNER_PASSWORD and GITHUB_WRITE_TOKEN must both be set in Vercel' });
  if (!passwordOk(request.headers.get('x-owner-password'))) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS)); // slows down guessing
    return reply(401, { error: 'Wrong owner password' });
  }
  let req: MoveRequest;
  try {
    req = (await request.json()) as MoveRequest;
  } catch {
    return reply(400, { error: 'Body must be JSON' });
  }
  if (req?.action === 'check') return reply(200, { ok: true });
  const scrub = (s: string) => s.split(token).join('***');
  try {
    return reply(200, await move(req, { token }));
  } catch (e) {
    const msg = scrub(String(e instanceof Error ? e.message : e));
    return reply(e instanceof MoveError ? 409 : 502, { error: msg });
  }
}
