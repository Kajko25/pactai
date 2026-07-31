"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { identityRegistryAbi, jobEscrowAbi, reputationRegistryAbi } from "@/lib/abi";
import { IDENTITY_REGISTRY, JOB_ESCROW, REPUTATION_REGISTRY } from "@/lib/deployments";
import {
  EscrowState,
  OUTCOME_LABEL,
  formatTimestamp,
  formatUsdc,
  shortHash,
} from "@/lib/format";
import { forgetJob, formatCountdown, recordSettlement, taskSpec, type LocalJob } from "@/lib/jobs";
import type { ProofVerdict } from "@/lib/claim";
import { AddressLink, StateBadge, TxLink } from "./ui";
import { TxAction } from "./TxAction";
import { ProofPanel } from "./ProofPanel";
import { SettlementReceipt } from "./SettlementReceipt";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * A job you funded, from the requester's side: what state the escrow is in,
 * what you can do about it right now, and — once something is delivered —
 * whether the thing delivered is actually what you asked for.
 */
export function RequesterJobCard({
  job,
  viewer,
  onForget,
}: {
  job: LocalJob;
  viewer: Address;
  onForget: () => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const [verdict, setVerdict] = useState<ProofVerdict>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Polled rather than event-driven: the executor's delivery is someone else's
  // transaction, so there is nothing local to react to.
  const onChain = useReadContract({
    abi: jobEscrowAbi,
    address: JOB_ESCROW,
    functionName: "getJob",
    args: [job.jobId],
    query: { refetchInterval: 8000 },
  });

  const record = useReadContract({
    abi: reputationRegistryAbi,
    address: REPUTATION_REGISTRY,
    functionName: "getRecord",
    args: [job.jobId],
    query: { refetchInterval: 20000 },
  });

  const executorAgentId = useReadContract({
    abi: identityRegistryAbi,
    address: IDENTITY_REGISTRY,
    functionName: "agentIdOf",
    args: [job.executor],
  });

  const state = (onChain.data?.state ?? EscrowState.None) as EscrowState;
  const deadline = onChain.data ? Number(onChain.data.deadline) : job.deadline;
  const amount = onChain.data?.amount ?? BigInt(job.amount);
  const resultHash = onChain.data?.resultHash;
  const hasResult = Boolean(resultHash && resultHash !== ZERO_HASH);

  const isRequester = onChain.data
    ? onChain.data.requester.toLowerCase() === viewer.toLowerCase()
    : false;
  const remaining = deadline - now;
  const deadlinePassed = remaining <= 0;
  const settled = state === EscrowState.Released || state === EscrowState.Refunded;
  const recorded = (record.data?.outcome ?? 0) !== 0;
  const executorRegistered = (executorAgentId.data ?? 0n) > 0n;

  function refresh() {
    void onChain.refetch();
    void record.refetch();
  }

  /** Release and refund are the transactions that end a job, so their hash is
   *  what the receipt needs; the funding hash alone tells half the story. */
  function onSettled(hash: Hex) {
    recordSettlement(job.jobId, hash);
    refresh();
  }

  const send = (functionName: "release" | "refund") => (): Promise<Hex> =>
    writeContractAsync({
      abi: jobEscrowAbi,
      address: JOB_ESCROW,
      functionName,
      args: [job.jobId],
    });

  return (
    <div className="rounded-xl border border-hairline bg-panel p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StateBadge state={state} />
        <span className="font-mono text-sm">{formatUsdc(amount)} USDC</span>
        <span className="text-sm text-ink">{job.facility}</span>
        <span className="ml-auto text-xs text-muted">
          {settled ? (
            "settled"
          ) : deadlinePassed ? (
            <span className="text-danger">deadline elapsed</span>
          ) : (
            <>refund unlocks in {formatCountdown(remaining)}</>
          )}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <Row label="Executor">
          <AddressLink address={job.executor} />
        </Row>
        <Row label="Escrow deadline">
          <span className="font-mono text-muted">{formatTimestamp(deadline)}</span>
        </Row>
        <Row label="Appointment no later than">
          <span className="font-mono text-muted">{formatTimestamp(job.notAfter)}</span>
        </Row>
        <Row label="Job id">
          <span className="font-mono text-muted" title={job.jobId}>
            {shortHash(job.jobId, 12, 8)}
          </span>
        </Row>
        {job.fundTxHash ? (
          <Row label="Funding tx">
            <TxLink hash={job.fundTxHash} />
          </Row>
        ) : null}
        <Row label="Reputation record">
          <span className="font-mono text-muted">
            {recorded ? `${OUTCOME_LABEL[record.data!.outcome]} (ERC-8004)` : "not recorded"}
          </span>
        </Row>
      </dl>

      {state === EscrowState.Funded ? (
        <p className="mt-4 text-xs text-muted">
          Funded and waiting. The executor has until the deadline to capture a slot and commit its
          hash on-chain; nothing is payable until it does.
        </p>
      ) : null}

      {settled ? (
        <SettlementReceipt
          job={job}
          state={state}
          amount={amount}
          resultHash={hasResult ? (resultHash as Hex) : undefined}
          verdict={verdict}
          requester={onChain.data?.requester}
          executorAgentId={executorAgentId.data}
          outcomeRecorded={recorded}
        />
      ) : null}

      {hasResult && !settled ? (
        <ProofPanel
          resultHash={resultHash as Hex}
          task={{ facility: job.facility, notAfter: job.notAfter }}
          executor={job.executor}
          onVerdict={setVerdict}
        />
      ) : null}

      <div className="mt-5 flex flex-wrap items-start gap-4">
        {state === EscrowState.Delivered && isRequester ? (
          <TxAction
            label={verdict?.ok ? "Release payment" : "Release without verifying"}
            pendingLabel="Paying the executor…"
            tone={verdict?.ok ? "mint" : "ghost"}
            hint={
              verdict?.ok
                ? "the proof checks out — this pays the executor"
                : verdict
                  ? "the proof did NOT check out; releasing anyway pays for work that does not match the job"
                  : "verify the claim above first — releasing is final"
            }
            send={send("release")}
            onConfirmed={onSettled}
          />
        ) : null}

        {state === EscrowState.Funded && isRequester && !deadlinePassed ? (
          <TxAction
            label="Cancel & refund"
            tone="danger"
            hint="nothing delivered yet — take your USDC back now"
            send={send("refund")}
            onConfirmed={onSettled}
          />
        ) : null}

        {deadlinePassed &&
        (state === EscrowState.Funded || state === EscrowState.Delivered) ? (
          <TxAction
            label="Refund (deadline passed)"
            tone="danger"
            hint="past the deadline anyone can trigger this — you are not at the executor's mercy"
            send={send("refund")}
            onConfirmed={onSettled}
          />
        ) : null}

        {settled && !recorded ? (
          executorRegistered ? (
            <TxAction
              label="Record outcome"
              tone="ghost"
              hint="writes this job's final state into the ERC-8004 reputation registry — permissionless"
              send={() =>
                writeContractAsync({
                  abi: reputationRegistryAbi,
                  address: REPUTATION_REGISTRY,
                  functionName: "recordOutcome",
                  args: [job.jobId],
                })
              }
              onConfirmed={refresh}
            />
          ) : (
            <p className="max-w-md text-xs text-muted">
              This executor is not registered in the Identity Registry, so its outcome cannot be
              recorded — reputation only accrues to agents with an on-chain identity.
            </p>
          )
        ) : null}
      </div>

      <details className="mt-5">
        <summary className="cursor-pointer text-xs text-muted hover:text-accent">
          Job spec &amp; local record
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-hairline bg-panel2 p-3 font-mono text-[11px] text-muted">
          {taskSpec(job)}
        </pre>
        <p className="mt-2 text-xs text-muted">
          The spec lives in this browser, not on-chain — the escrow only ever holds the money and
          the result hash. Removing it here leaves the escrow untouched.
        </p>
        <button
          onClick={() => {
            forgetJob(job.jobId);
            onForget();
          }}
          className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs hover:border-danger hover:text-danger"
        >
          Remove from this browser
        </button>
      </details>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
