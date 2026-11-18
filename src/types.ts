// What /api/projects answers (lib/github.mjs: loadAll).
import type { BuiltDay, Counts, Idea, Section, SuiteRecord } from '../lib/lists.mjs';

export type { BuiltDay, BuiltItem, Counts, Duration, Estimate, Idea, PlannedItem, Section, SuiteRecord } from '../lib/lists.mjs';

export interface Project {
  repo: string;
  description: string | null;
  url: string | null;
  status: string | null;
  devices: string[] | null;
  inProjectsJson: boolean;
  github: { url: string; private: boolean; pushedAt: string | null; createdAt: string | null; defaultBranch: string | null; archived: boolean } | null;
  backlogChangedAt: string | null;
  warning: string | null;
  error: string | null;
  files: { backlog: boolean; built: boolean; ideas: boolean };
  noFiles: boolean;
  planned: Section[];
  built: BuiltDay[];
  ideas: Idea[];
  latestVersion: string | null;
  latestBuiltDate: string | null;
  /** BUILT.md header's measured suite times (BL-8). */
  suite: SuiteRecord | null;
  counts: Counts;
}

export interface Data {
  generatedAt: string;
  tokenSet: boolean;
  owner: string;
  problems: string[];
  /** UNASSIGNED_IDEAS.md in this repo (BL-7): file = it exists. */
  unassigned: { file: boolean; ideas: Idea[] };
  projects: Project[];
}
