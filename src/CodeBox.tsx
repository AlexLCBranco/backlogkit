// BL-20: the box above the search results that says what a searched code is, in a few plain lines.
import { missingText, stateText, type CodeHit, type CodeQuery } from './code';

const FILE: Record<CodeHit['state'], string> = { Planned: 'the plan', Blocked: 'the plan', Built: 'the built list', Idea: 'the ideas list' };

export function CodeBox({ query, hits }: { query: CodeQuery; hits: CodeHit[] }) {
  return (
    <section className="code-box" data-testid="code-box" data-no-marquee aria-label={`What ${query.code} is`}>
      {!hits.length && (
        <p className="code-missing" data-testid="code-missing">
          {missingText(query)}
        </p>
      )}
      {hits.map((h) => (
        <div key={h.key} className="code-hit" data-testid="code-hit">
          <h2>
            <span className="id" data-testid="code-id">{h.code}</span> <span data-testid="code-title">{h.title}</span>
          </h2>
          <p>
            <span className="muted">Project:</span>{' '}
            <span className={`tag${h.repo === null ? ' tag-unassigned' : ''}`} data-testid="code-repo">{h.repo ?? 'Unassigned'}</span>
          </p>
          <p>
            <span className="muted">State:</span>{' '}
            <span className={`code-state code-state-${h.state.toLowerCase()}`} data-testid="code-state">{stateText(h)}</span>
          </p>
          {h.state !== 'Idea' && (
            <p>
              <span className="muted">In short:</span> <span data-testid="code-short">{h.short ?? '—'}</span>
            </p>
          )}
          {h.href && (
            <p>
              <a href={h.href} target="_blank" rel="noreferrer" data-testid="code-link">
                Open it in {FILE[h.state]} on GitHub
              </a>
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
