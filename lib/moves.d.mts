export class MoveError extends Error {}
export const ID_RE: RegExp
export function idPrefix(backlog: string | null, built: string | null): string | null
export function nextId(prefix: string, ...texts: (string | null | undefined)[]): string
export function ideaToHeld(a: { ideasText: string | null; ideaId: string; backlog: string | null; built: string | null }): { ideas: string; backlog: string; id: string; title: string }
export function cutIdea(ideasText: string | null, ideaId: string): { ideas: string; text: string }
export function heldToReady(a: { backlog: string | null; id: string }): { backlog: string; title: string }
