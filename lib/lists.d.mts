export type SectionKind = 'ready' | 'held' | 'other'
export interface Duration { min: number; max: number }
export interface Estimate { raw: string; build: Duration | null; suite: Duration | null; ok: boolean }
export interface SuiteRecord { raw: string; last: { minutes: number; date: string | null } | null; longest: { minutes: number; date: string | null } | null }
export interface PlannedItem { id: string | null; title: string; heading: string; body: string; blocked: boolean; estimate: Estimate | null; short: string | null; blockedNote: BlockedNote | null }
export interface BlockedNote { text: string; date: string | null }
export interface Section { name: string; kind: SectionKind; items: PlannedItem[] }
export interface BuiltItem { id: string | null; title: string; text: string; detail: string; markdown: string; version: string | null; took: Estimate | null }
export interface BuiltDay { date: string; items: BuiltItem[] }
export type Why = 'waiting' | 'decision' | 'too-big' | 'later' | 'never'
export interface Idea { id: string | null; title: string; text: string; note: string | null; why: Why | null; badWhy: string | null }
export const WHY: Why[]
export function splitIdea(title: string): { text: string; note: string | null; why: Why | null; badWhy: string | null }
export interface Counts { ready: number; held: number; planned: number; blocked: number; ideas: number }

export function splitId(text: string): { id: string | null; title: string }
export function sectionKind(name: string): SectionKind
export function parseBacklog(text: string): Section[]
export function parseShort(body: string): string | null
export function parseBlocked(body: string): BlockedNote | null
export function blockedSpan(lines: string[], from?: number, to?: number): { start: number; end: number; text: string } | null
export function parseBuiltDays(text: string): BuiltDay[]
export function parseBuilt(text: string): Record<string, string[]>
export function parseIdeas(text: string): Idea[]
export function parseDuration(text: string): Duration | null
export function parseEstimate(body: string): Estimate | null
export function parseTook(text: string): Estimate | null
export function parseSuiteRecord(text: string): SuiteRecord | null
export function estimateTotal(items: { estimate: Estimate | null }[]): { build: Duration | null; suite: Duration | null; estimated: number; total: number }
export function formatDuration(d: Duration | null): string | null
export function parseUnassignedIdeas(text: string | null | undefined): Idea[]
export function ideaMarkdown(idea: Pick<Idea, "id" | "title">): string
export function builtSummary(days: BuiltDay[], text?: string): { latestVersion: string | null; latestBuiltDate: string | null }
export function counts(sections: Section[], ideas: Idea[]): Counts
export function itemMarkdown(item: { id: string | null; title: string; heading?: string; body: string }, level?: number): string
export function backlogMarkdown(sections: Section[]): string
