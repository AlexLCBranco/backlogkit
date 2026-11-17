export type SectionKind = 'ready' | 'held' | 'other'
export interface PlannedItem { id: string | null; title: string; body: string; blocked: boolean }
export interface Section { name: string; kind: SectionKind; items: PlannedItem[] }
export interface BuiltItem { id: string | null; title: string; text: string; detail: string; version: string | null }
export interface BuiltDay { date: string; items: BuiltItem[] }
export interface Idea { id: string | null; title: string }
export interface Counts { ready: number; held: number; planned: number; blocked: number; ideas: number }

export function splitId(text: string): { id: string | null; title: string }
export function sectionKind(name: string): SectionKind
export function parseBacklog(text: string): Section[]
export function parseBuiltDays(text: string): BuiltDay[]
export function parseBuilt(text: string): Record<string, string[]>
export function parseIdeas(text: string): Idea[]
export function builtSummary(days: BuiltDay[], text?: string): { latestVersion: string | null; latestBuiltDate: string | null }
export function counts(sections: Section[], ideas: Idea[]): Counts
