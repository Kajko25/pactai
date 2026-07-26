"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { parseClaim, verifyClaim, type ProofVerdict, type SlotTask } from "@/lib/claim";
import { shortHash } from "@/lib/format";

const DEFAULT_ORACLE = process.env.NEXT_PUBLIC_SLOT_SOURCE_URL ?? "http://localhost:4100";

/**
 * The proof, in a form a person can act on.
 *
 * What the escrow holds is a 32-byte hash — enough for a machine, useless for
 * a human deciding whether to pay. So the panel does what the requester agent
 * does: fetch the claim back from the slot source (the executor's own copy is
 * not evidence), re-hash it, and turn the result into four plain statements.
 * A hash on its own can only be equal or unequal; these say *what* was
 * captured, and whether it is the thing that was paid for.
 */
export function ProofPanel({
  resultHash,
  task,
  executor,
  onVerdict,
}: {
  resultHash: Hex;
  task: SlotTask;
  executor: string;
  onVerdict?: (verdict: ProofVerdict | undefined) => void;
}) {
  const [oracleUrl, setOracleUrl] = useState(DEFAULT_ORACLE);
  const [claimId, setClaimId] = useState("");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [verdict, setVerdict] = useState<ProofVerdict>();

  function apply(text: string) {
    const claim = parseClaim(text);
    if ("error" in claim) {
      setError(claim.error);
      setVerdict(undefined);
      onVerdict?.(undefined);
      return;
    }
    const next = verifyClaim(claim, resultHash, task, executor);
    setError(undefined);
    setVerdict(next);
    onVerdict?.(next);
  }

  async function fetchClaim() {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`${oracleUrl.replace(/\/$/, "")}/claims/${claimId.trim()}`);
      if (!res.ok) {
        setError(
          res.status === 404
            ? "The slot source has no claim with that id."
            : `Slot source returned ${res.status}.`,
        );
        setVerdict(undefined);
        onVerdict?.(undefined);
        return;
      }
      const text = await res.text();
      setRaw(text);
      apply(text);
    } catch {
      setError(
        `Could not reach the slot source at ${oracleUrl}. Start it with \`bun run slot-source\`, or paste the claim JSON below.`,
      );
      setVerdict(undefined);
      onVerdict?.(undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-hairline bg-panel2 p-4">
      <h4 className="text-sm font-bold">What did the executor actually deliver?</h4>
      <p className="mt-1 text-xs text-muted">
        The escrow only holds a hash. Fetch the claim back from the slot source and this panel
        re-checks it against the chain — the same check the requester agent runs before it pays.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Slot source URL" value={oracleUrl} onChange={setOracleUrl} />
          <Input
            label="Claim id"
            value={claimId}
            onChange={setClaimId}
            placeholder="uuid from the delivered result"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchClaim}
            disabled={loading || claimId.trim() === ""}
            className="h-9 rounded-lg border border-hairline px-4 text-sm font-semibold hover:border-accent disabled:opacity-50"
          >
            {loading ? "Fetching…" : "Fetch & verify"}
          </button>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-accent">
          Or paste the claim JSON directly
        </summary>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder='{"claimId":"…","slotId":"…","facility":"…","date":…,"claimant":"0x…","claimedAt":…}'
          className="mt-2 w-full rounded-lg border border-hairline bg-bg p-2 font-mono text-xs"
        />
        <button
          onClick={() => apply(raw)}
          disabled={raw.trim() === ""}
          className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
        >
          Verify pasted claim
        </button>
      </details>

      {error ? <p className="mt-3 text-xs text-amber">{error}</p> : null}

      {verdict ? (
        <div className="mt-4">
          <div
            className={`text-sm font-bold ${verdict.ok ? "text-mint" : "text-danger"}`}
          >
            {verdict.ok
              ? "Proof holds — this is what you paid for"
              : "Proof does not hold — do not release"}
          </div>
          <ul className="mt-2 grid gap-2">
            {verdict.checks.map((check) => (
              <li key={check.label} className="flex gap-2 text-xs">
                <span className={check.ok ? "text-mint" : "text-danger"}>
                  {check.ok ? "✓" : "✕"}
                </span>
                <span>
                  <span className="text-ink">{check.label}</span>
                  <span className="block text-muted">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[11px] text-muted">
            claim hash {shortHash(verdict.computedHash, 12, 8)} · on-chain{" "}
            {shortHash(resultHash, 12, 8)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="mt-1 h-9 w-full rounded-lg border border-hairline bg-bg px-2 font-mono text-xs"
      />
    </label>
  );
}
