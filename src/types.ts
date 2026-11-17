// What /api/projects answers (lib/github.mjs: loadAll).
import type { BuiltDay, Counts, Idea, Section } from '../lib/lists.mjs';

export type { BuiltDay, BuiltItem, Counts, Idea, PlannedItem, Section } from '../lib/lists.mjs';

export interface Project {
  repo: string;
  description: string | null;
  url: string | null;
  status: string | null;
  devices: string[] | null;
  inProjectsJson: boolean;
  github: { url: string; private: boolean; pushedAt: string | null; defaultBranch: string | null; archived: boolean } | null;
  warning: string | null;
  error: string | null;
  files: { backlog: boolean; built: boolean; ideas: boolean };
  noFiles: boolean;
  planned: Section[];
  built: BuiltDay[];
  ideas: Idea[];
  latestVersion: string | null;
  latestBuiltDate: string | null;
  counts: Counts;
}

export interface Data {
  generatedAt: string;
  tokenSet: boolean;
  owner: string;
  problems: string[];
  projects: Project[];
}
