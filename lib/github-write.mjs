// Writing to the owner's repos (BL-11): read files at a branch's head commit, then commit changed files on top of
// exactly that commit (Git Data API: one commit for all files). If the branch moved meanwhile GitHub refuses the
// update (not a fast-forward) and nothing is written; the caller reads again and retries. Server side only
// (api/move.ts); the token is used in request headers here and scrubbed from every error message.
import { OWNER } from './github.mjs'

export class WriteError extends Error {
  constructor(status, what) {
    super(`${what}: HTTP ${status}${status === 401 ? ' (token rejected)' : status === 403 ? ' (token lacks write access, or rate limit)' : status === 404 ? ' (not found, or the token cannot see it)' : ''}`)
    this.status = status
  }
}

export function makeWriter({ token, fetchImpl = fetch }) {
  const api = `https://api.github.com/repos/${OWNER}`
  const call = async (method, path, what, body, accept = 'application/vnd.github+json') => {
    const r = await fetchImpl(`${api}/${path}`, {
      method,
      headers: { Accept: accept, 'User-Agent': 'backlogkit', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new WriteError(r.status, what)
    return r
  }
  const json = async (...a) => (await call(...a)).json()
  return {
    /** The repo's default branch and that branch's head commit sha. */
    async head(repo) {
      const info = await json('GET', encodeURIComponent(repo), `${repo}`)
      if (info.archived) throw new WriteError(403, `${repo} is archived`)
      const branch = info.default_branch
      const ref = await json('GET', `${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`, `${repo} branch ${branch}`)
      return { branch, sha: ref.object.sha }
    },
    /** A file's text at a commit, or null when it doesn't exist there. */
    async file(repo, path, sha) {
      try {
        return await (await call('GET', `${encodeURIComponent(repo)}/contents/${path}?ref=${sha}`, `${repo}/${path}`, undefined, 'application/vnd.github.raw+json')).text()
      } catch (e) {
        if (e instanceof WriteError && e.status === 404) return null
        throw e
      }
    },
    /** One commit with `files` ({ path: text }) on top of `parent`, then the branch moved to it (never forced). */
    async commit(repo, { branch, sha: parent }, files, message) {
      const r = encodeURIComponent(repo)
      const base = await json('GET', `${r}/git/commits/${parent}`, `${repo} commit`)
      const tree = await json('POST', `${r}/git/trees`, `${repo} tree`, {
        base_tree: base.tree.sha,
        tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
      })
      const commit = await json('POST', `${r}/git/commits`, `${repo} commit`, { message, tree: tree.sha, parents: [parent] })
      await call('PATCH', `${r}/git/refs/heads/${encodeURIComponent(branch)}`, `${repo} branch update`, { sha: commit.sha, force: false })
      return commit.sha
    },
  }
}
