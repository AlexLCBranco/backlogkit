// A small always-visible copy icon (BL-3). Copies `text` with the Clipboard API; the icon turns into a checkmark for
// about 1.5 s. Inside a <summary> it never toggles the row (preventDefault + stopPropagation).
import { useEffect, useRef, useState } from 'react';

export const COPIED_MS = 1500;

const CopyIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M3.5 11H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`copy${copied ? ' copied' : ''}`}
      aria-label={label}
      title={label}
      data-copied={copied || undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), COPIED_MS);
        });
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
