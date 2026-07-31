"use client";

import type { Address, Hex } from "viem";
import { JOB_ESCROW } from "@/lib/deployments";
import { EscrowState, formatTimestamp, formatUsdc, shortHash } from "@/lib/format";
import type { LocalJob } from "@/lib/jobs";
import type { ProofVerdict } from "@/lib/claim";
import { useState } from "react";
import { AddressLink, TxLink } from "./ui";

/**
 * What a settled job leaves behind.
 *
 * The escrow's terminal state is two words — Released or Refunded — and that is
 * the least interesting part. A requester who comes back a week later wants the
 * whole story in one place: what was asked for, who was hired, whether the
 * delivered claim actually verified, where the money went, and the transactions
 * that prove each of those.
 *
 * Deliberately honest about provenance, because half of this is not on-chain.
 * The escrow stores money, parties, a deadline and a result hash; it does not
 * store *what was asked for* — that lives in the browser's own record. Fields
 * that came from localStorage are marked as such, so a receipt reconstructed on
 * another machine (where those labels are gone) reads as incomplete rather than
 * as a job with no requirements.
 */
export function SettlementReceipt({
  job,
  state,
  amount,
  resultHash,
  verdict,
  requester,
  executorAgentId,
  outcomeRecorded,
}: {
  job: LocalJob;
  state: EscrowState;
  amount: bigint;
  resultHash?: Hex;
  verdict?: ProofVerdict;
  requester?: Address;
  executorAgentId?: bigint;
  outcomeRecorded: boolean;
}) {
  const released = state === EscrowState.Released;
  const paidTo = released ? job.executor : requester;

  const lines = [
    `PactAI settlement receipt`,
    `outcome        ${released ? "RELEASED — paid to executor" : "REFUNDED — returned to requester"}`,
    `amount         ${formatUsdc(amount)} USDC`,
    `job id         ${job.jobId}`,
    `facility       ${job.facility}`,
    `appointment by ${formatTimestamp(job.notAfter)}`,
    `escrow         ${JOB_ESCROW}`,
    `executor       ${job.executor}`,
    resultHash ? `result hash    ${resultHash}` : `result hash    none — nothing was ever delivered`,
    job.fundTxHash ? `funding tx     ${job.fundTxHash}` : ``,
    job.settleTxHash ? `settlement tx  ${job.settleTxHash}` : ``,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className={`mt-5 rounded-xl border p-5 ${
        released ? "border-mint/40 bg-mint/5" : "border-danger/40 bg-danger/5"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`text-sm font-extrabold ${released ? "text-mint" : "text-danger"}`}>
          {released ? "Released" : "Refunded"}
        </span>
        <span className="font-mono text-lg">{formatUsdc(amount)} USDC</span>
        <span className="text-xs text-muted">
          {released ? "paid to the executor" : "returned to the requester"}
        </span>
      </div>

      <p className="mt-2 max-w-prose text-xs text-muted">
        {released
          ? "The requester approved the delivered claim and the escrow paid out. This is final: JobEscrow has no clawback."
          : resultHash
            ? "The deadline passed with a result committed but not approved, so the escrow returned the money. The executor delivered something and was not paid for it."
            : "Nothing was ever delivered, so the escrow returned the money. The executor was never paid and the requester never received a slot."}
      </p>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <Line label="Paid to">{paidTo ? <AddressLink address={paidTo} /> : <Unknown />}</Line>
        <Line label="Executor">
          <span className="flex items-center gap-2">
            <AddressLink address={job.executor} />
            {executorAgentId && executorAgentId > 0n ? (
              <span className="rounded border border-hairline px-1 font-mono text-[10px] text-muted">
                agent #{executorAgentId.toString()}
              </span>
            ) : null}
          </span>
        </Line>

        <Line label="Facility" source="local">
          <span className="text-ink">{job.facility}</span>
        </Line>
        <Line label="Appointment no later than" source="local">
          <span className="font-mono text-muted">{formatTimestamp(job.notAfter)}</span>
        </Line>

        <Line label="Job id">
          <span className="font-mono text-muted" title={job.jobId}>
            {shortHash(job.jobId, 12, 8)}
          </span>
        </Line>
        <Line label="Escrow deadline">
          <span className="font-mono text-muted">{formatTimestamp(job.deadline)}</span>
        </Line>

        <Line label="Result hash">
          {resultHash ? (
            <span className="font-mono text-muted" title={resultHash}>
              {shortHash(resultHash, 12, 8)}
            </span>
          ) : (
            <span className="text-muted">none committed</span>
          )}
        </Line>
        <Line label="Verification">
          {verdict ? (
            <span className={verdict.ok ? "text-mint" : "text-danger"}>
              {verdict.ok ? "all four checks passed" : "checks did NOT pass"}
            </span>
          ) : (
            // Not the same as failing. A refund path never has a claim to check,
            // and a receipt viewed after a page reload has lost the in-memory verdict.
            <span className="text-muted">not checked in this session</span>
          )}
        </Line>

        <Line label="Funding tx">
          {job.fundTxHash ? <TxLink hash={job.fundTxHash} /> : <Unknown />}
        </Line>
        <Line label="Settlement tx">
          {job.settleTxHash ? (
            <TxLink hash={job.settleTxHash} />
          ) : (
            <span className="text-muted">settled elsewhere — not recorded here</span>
          )}
        </Line>

        <Line label="ERC-8004 record">
          <span className={outcomeRecorded ? "text-mint" : "text-muted"}>
            {outcomeRecorded ? "written to the reputation registry" : "not recorded yet"}
          </span>
        </Line>
        <Line label="Escrow contract">
          <AddressLink address={JOB_ESCROW} showLabel={false} />
        </Line>
      </dl>

      <div className="mt-4">
        <CopyReceipt text={lines} />
      </div>
    </div>
  );
}

/** The whole receipt as plain text, for pasting into a support thread or a
 *  ticket. Deliberately not rendered inline: CopyLine shows its value whole,
 *  which is right for a single hash and wrong for eleven lines. */
function CopyReceipt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is blocked on insecure origins; every field is on screen anyway.
    }
  }

  return (
    <button
      onClick={copy}
      className="rounded border border-hairline px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
    >
      {copied ? "receipt copied" : "copy receipt as text"}
    </button>
  );
}

function Line({
  label,
  source,
  children,
}: {
  label: string;
  source?: "local";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline/50 pb-1">
      <dt className="text-muted">
        {label}
        {source === "local" ? (
          <span
            className="ml-1 text-[10px] text-muted/70"
            title="From this browser's own record — the escrow does not store what was asked for"
          >
            (local)
          </span>
        ) : null}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const Unknown = () => <span className="text-muted">unknown</span>;
