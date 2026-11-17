// Reads every project, live: the hand-edited projects.json (from this repo's main on GitHub) merged per repo with
// GitHub's repo list and each repo's three lists. Server side only (api/projects.ts): the token is used in request
// headers here and never put in the result. Without a token only public repos can be listed and read; projects.json
// entries GitHub doesn't show then count as unread (private, or missing), not as missing.
import { builtSummary, counts, parseBacklog, parseBuiltDays, parseIdeas } from './lists.mjs'

export const OWNER = 'AlexLCBranco'
export const SELF = 'backlogkit'
export const FILES = { backlog: 'FEATURE_BACKLOG.md', built: 'BUILT.md', ideas: 'IDEAS.md' }
const STATUS_ORDER = { active: 0, paused: 1, retired: 2 }

class HttpError extends Error {
  constructor(status, what) {
    super(`${what}: HTTP ${status}${status === 401 ? ' (token rejected)' : status === 403 ? ' (no access or rate limit)' : ''}`)
    this.status = status
  }
}

/** The token's value is replaced by "***" in any text that goes out (error messages included). */
const scrub = (text, token) => (token ? String(text).split(token).join('***') : String(text))

export function makeGithub({ token, fetchImpl = fetch } = {}) {
  const headers = (accept) => ({ Accept: accept, 'User-Agent': 'backlogkit', ...(token ? { Authorization: `Bearer ${token}` } : {}) })
  const get = async (url, accept, what) => {
    const r = await fetchImpl(url, { headers: headers(accept), signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new HttpError(r.status, what)
    return r
  }
  return {
    /** Every repo of the owner (private ones only with a token that can see them). */
    async repos() {
      const all = []
      for (let page = 1; page < 20; page++) {
        const url = token
          ? `https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}`
          : `https://api.github.com/users/${OWNER}/repos?type=owner&per_page=100&page=${page}`
        const batch = await (await get(url, 'application/vnd.github+json', 'repo list')).json()
        all.push(...batch.filter((r) => !r.owner || r.owner.login === OWNER))
        if (batch.length < 100) break
      }
      return all
    },
    /** A file's text, or null when it doesn't exist. Without a token: raw.githubusercontent.com (public repos; not
     *  counted against the API's 60 requests an hour). */
    async file(repo, path, ref) {
      const url = token
        ? `https://api.github.com/repos/${OWNER}/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`
        : `https://raw.githubusercontent.com/${OWNER}/${repo}/${encodeURIComponent(ref || 'HEAD')}/${path}`
      try {
        return await (await get(url, 'application/vnd.github.raw+json', `${repo}/${path}`)).text()
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null
        throw e
      }
    },
  }
}

const sortKey = (p) => [p.noFiles ? 1 : 0, STATUS_ORDER[p.status] ?? 3, -(Date.parse(p.github?.pushedAt ?? '') || 0), p.repo]
export function compareProjects(a, b) {
  const [x, y] = [sortKey(a), sortKey(b)]
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

/** Reads one repo's three lists into the project (or sets project.error with the reason). */
async function readLists(gh, project, ref) {
  const [backlog, built, ideas] = await Promise.all(Object.values(FILES).map((f) => gh.file(project.repo, f, ref)))
  project.files = { backlog: backlog !== null, built: built !== null, ideas: ideas !== null }
  project.noFiles = backlog === null && built === null && ideas === null
  project.planned = backlog === null ? [] : parseBacklog(backlog)
  project.built = built === null ? [] : parseBuiltDays(built)
  project.ideas = ideas === null ? [] : parseIdeas(ideas)
  Object.assign(project, builtSummary(project.built, built ?? ''))
  project.counts = counts(project.planned, project.ideas)
}

const blank = (entry) => ({
  repo: entry.repo,
  description: entry.description ?? null,
  url: entry.url ?? null,
  status: entry.status ?? null,
  devices: entry.devices ?? null,
  inProjectsJson: !!entry.inProjectsJson,
  github: null,
  warning: null,
  error: null,
  files: { backlog: false, built: false, ideas: false },
  noFiles: false,
  planned: [],
  built: [],
  ideas: [],
  latestVersion: null,
  latestBuiltDate: null,
  counts: { ready: 0, held: 0, planned: 0, blocked: 0, ideas: 0 },
})

/** projects.json's text → its entries (throws with a plain reason when it's malformed). */
export function parseProjectsJson(text) {
  const data = JSON.parse(text)
  if (!Array.isArray(data?.projects)) throw new Error('projects.json has no "projects" list')
  return data.projects.filter((p) => p && typeof p.repo === 'string')
}

/** Everything the site shows: { generatedAt, tokenSet, owner, problems: [...], projects: [...] }. */
export async function loadAll({ token, fetchImpl = fetch, now = () => new Date() } = {}) {
  const gh = makeGithub({ token: token || undefined, fetchImpl })
  const problems = []
  let entries = []
  try {
    const text = await gh.file(SELF, 'projects.json', 'main')
    if (text === null) problems.push('projects.json not found on main')
    else entries = parseProjectsJson(text)
  } catch (e) {
    problems.push(`projects.json not read: ${scrub(e.message, token)}`)
  }

  let repos = null
  try {
    repos = await gh.repos()
  } catch (e) {
    problems.push(`GitHub repo list not read: ${scrub(e.message, token)}`)
  }

  const byRepo = new Map()
  for (const e of entries) byRepo.set(e.repo.toLowerCase(), blank({ ...e, inProjectsJson: true }))
  for (const r of repos ?? []) {
    const key = r.name.toLowerCase()
    if (!byRepo.has(key)) byRepo.set(key, blank({ repo: r.name }))
    const p = byRepo.get(key)
    p.repo = r.name
    p.github = { url: r.html_url, private: !!r.private, pushedAt: r.pushed_at ?? null, defaultBranch: r.default_branch ?? null, archived: !!r.archived }
  }

  await Promise.all(
    [...byRepo.values()].map(async (p) => {
      if (!p.github) {
        if (!repos) p.error = 'GitHub repo list not read (see the warning at the top)'
        else if (!token) p.error = 'Unread: not public on GitHub, and no token is set (private repo, or the repo does not exist)'
        else p.warning = `No repo "${p.repo}" under ${OWNER} on GitHub (listed in projects.json)`
        return
      }
      try {
        await readLists(gh, p, p.github.defaultBranch)
      } catch (e) {
        p.error = `Not read: ${scrub(e.message, token)}`
      }
    }),
  )

  return {
    generatedAt: now().toISOString(),
    tokenSet: !!token,
    owner: OWNER,
    problems,
    projects: [...byRepo.values()].sort(compareProjects),
  }
}
