// The site's version in the page's bottom-right corner ("v1.3.0"); the commit and build time are in its tooltip.

export function SiteVersion({ version, commit, builtAt }: { version: string; commit: string; builtAt: string }) {
  const t = Date.parse(builtAt);
  const when = Number.isNaN(t) ? '' : `, built ${new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
  return (
    <div className="site-version" data-testid="site-version" title={`Version ${version} · commit ${commit}${when}`}>
      v{version}
    </div>
  );
}
