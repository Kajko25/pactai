"use client";

import { useState } from "react";

/**
 * A value the user has to hand to someone else — a claim id, a result URI.
 * Selecting a truncated monospace string by hand is how demos go wrong, so
 * these are copyable and shown whole.
 */
export function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is blocked on insecure origins; the value is visible anyway.
    }
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink">{value}</code>
      <button
        onClick={copy}
        className="shrink-0 rounded border border-hairline px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
