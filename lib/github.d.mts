import type { BuiltDay, Counts, Idea, Section } from './lists.mjs'

export const OWNER: string
export const SELF: string
export const FILES: { backlog: string; built: string; ideas: string }

export interface LoadedProject {
  repo: string
  description: string | null
  url: string | null
  status: string | null
  devices: string[] | null
  inProjectsJson: boolean
  github: { url: string; private: boolean; pushedAt: string | null; defaultBranch: string | null; archived: boolean } | null
  warning: string | null
  error: string | null
  files: { backlog: boolean; built: boolean; ideas: boolean }
  noFiles: boolean
  planned: Section[]
  built: BuiltDay[]
  ideas: Idea[]
  latestVersion: string | null
  latestBuiltDate: string | null
  counts: Counts
}

export interface Loaded { generatedAt: string; tokenSet: boolean; owner: string; problems: string[]; projects: LoadedProject[] }

export function makeGithub(opts?: { token?: string; fetchImpl?: typeof fetch }): {
  repos(): Promise<Array<{ name: string; html_url: string; private: boolean; pushed_at?: string; default_branch?: string; archived?: boolean }>>
  file(repo: string, path: string, ref?: string | null): Promise<string | null>
}
export function compareProjects(a: LoadedProject, b: LoadedProject): number
export function parseProjectsJson(text: string): Array<{ repo: string; description?: string | null; url?: string | null; status?: string | null; devices?: string[] | null }>
export function loadAll(opts?: { token?: string; fetchImpl?: typeof fetch; now?: () => Date }): Promise<Loaded>
