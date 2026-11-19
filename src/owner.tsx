// The owner's one-click moves (BL-11). Off unless the server says moves are set up (data.canMove). The owner types the
// password once (Owner button in the top bar); it is checked by the server and kept in this browser only. Then the
// Ideas page shows "→ Next" on each idea and the board "→ Now" on each Next item; each click is one commit on GitHub
// (api/move.ts), and the page updates from the answer.
import { createContext, useContext, useState, type FormEvent } from 'react';
import type { Data, Idea } from './types';

export const OWNER_STORAGE_KEY = 'backlogkit.owner';

export interface MoveRequest { action: 'idea' | 'ready'; repo: string; id: string; from?: 'unassigned' }
interface MoveAnswer {
  ok: true;
  message: string;
  updates: { repo: string; planned?: Data['projects'][number]['planned']; ideas?: Idea[]; counts?: Data['projects'][number]['counts'] }[];
  unassigned?: Idea[];
}

export interface Owner {
  /** Moves are set up on the server. */
  canMove: boolean;
  /** The owner has unlocked moves in this browser. */
  unlocked: boolean;
  /** Runs a move; resolves to an error text, or null when it worked. */
  move: (req: MoveRequest) => Promise<string | null>;
  unlock: (password: string) => Promise<string | null>;
  lock: () => void;
}

const off: Owner = { canMove: false, unlocked: false, move: async () => 'Moves are off', unlock: async () => 'Moves are off', lock: () => {} };
export const OwnerContext = createContext<Owner>(off);
export const useOwner = () => useContext(OwnerContext);

const load = () => {
  try {
    return localStorage.getItem(OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
};
const save = (v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(OWNER_STORAGE_KEY);
    else localStorage.setItem(OWNER_STORAGE_KEY, v);
  } catch {
    // storage blocked: unlocked until the page is reloaded
  }
};

async function post(password: string, body: object): Promise<{ ok: boolean; status: number; body: { error?: string } & Partial<MoveAnswer> }> {
  try {
    const r = await fetch('/api/move', { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-password': password }, body: JSON.stringify(body) });
    const json = (await r.json().catch(() => ({}))) as { error?: string } & Partial<MoveAnswer>;
    return { ok: r.ok && !json.error, status: r.status, body: json };
  } catch (e) {
    return { ok: false, status: 0, body: { error: `Network error: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

/** The moved repos' new lists, put into the page's data. */
export function applyMove(data: Data, a: Pick<MoveAnswer, 'updates' | 'unassigned'>): Data {
  const projects = data.projects.map((p) => {
    const u = a.updates.find((x) => x.repo.toLowerCase() === p.repo.toLowerCase());
    return u ? { ...p, planned: u.planned ?? p.planned, ideas: u.ideas ?? p.ideas, counts: u.counts ?? p.counts } : p;
  });
  return { ...data, projects, unassigned: a.unassigned ? { file: true, ideas: a.unassigned } : data.unassigned };
}

/** The owner state for the App: password in this browser, moves through /api/move. */
export function useOwnerState(data: Data | null, setData: (f: (d: Data | null) => Data | null) => void): Owner {
  const [password, setPassword] = useState<string | null>(load);
  const canMove = !!data?.canMove;
  return {
    canMove,
    unlocked: canMove && !!password,
    async unlock(pw) {
      const r = await post(pw, { action: 'check' });
      if (!r.ok) return r.body.error ?? `HTTP ${r.status}`;
      save(pw);
      setPassword(pw);
      return null;
    },
    lock() {
      save(null);
      setPassword(null);
    },
    async move(req) {
      if (!password) return 'Not unlocked';
      const r = await post(password, req);
      if (r.status === 401) {
        save(null);
        setPassword(null);
      }
      if (!r.ok) return r.body.error ?? `HTTP ${r.status}`;
      setData((d) => (d ? applyMove(d, r.body as MoveAnswer) : d));
      return null;
    },
  };
}

/** Top-bar control: "Owner" (unlock form) or "Owner ✓" (click to lock). Nothing when moves are off. */
export function OwnerControl() {
  const o = useOwner();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!o.canMove) return null;
  if (o.unlocked)
    return (
      <button type="button" className="owner on" data-testid="owner" title="Moves are on in this browser. Click to lock." onClick={o.lock}>
        Owner ✓
      </button>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const error = await o.unlock(pw);
    setBusy(false);
    setErr(error);
    if (!error) {
      setOpen(false);
      setPw('');
    }
  };
  return (
    <span className="owner-wrap">
      <button type="button" className="owner" data-testid="owner" aria-expanded={open} onClick={() => setOpen(!open)} title="Unlock the one-click moves">
        Owner
      </button>
      {open && (
        <form className="owner-form" onSubmit={submit} data-testid="owner-form">
          <input type="password" aria-label="Owner password" placeholder="Owner password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button type="submit" disabled={busy || !pw}>{busy ? '…' : 'Unlock'}</button>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}
    </span>
  );
}

/** One "→" button. Never toggles the row it sits in. Shows the error next to it when the move fails. */
export function MoveButton({ label, req, title, disabled }: { label: string; req: MoveRequest | null; title: string; disabled?: boolean }) {
  const o = useOwner();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!o.unlocked) return null;
  return (
    <>
      <button
        type="button"
        className="move"
        title={title}
        aria-label={title}
        disabled={busy || disabled || !req}
        data-testid="move"
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!req) return;
          setBusy(true);
          setErr(null);
          const error = await o.move(req);
          setBusy(false); // on success the row is gone or re-rendered elsewhere
          setErr(error);
        }}
      >
        {busy ? '…' : label}
      </button>
      {err && (
        <span className="error move-error" role="alert" data-testid="move-error" onClick={(e) => e.stopPropagation()}>
          {err}
        </span>
      )}
    </>
  );
}
