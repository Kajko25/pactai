"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { jobEscrowAbi } from "@/lib/abi";
import { JOB_ESCROW } from "@/lib/deployments";
import { EscrowState, formatTimestamp, formatUsdc, shortHash } from "@/lib/format";
import { formatCountdown } from "@/lib/jobs";
import { hashClaim, type SlotClaim } from "@/lib/claim";
import {
  DEFAULT_JOB_BOARD,
  DEFAULT_SLOT_SOURCE,
  claimSlot,
  claimUri,
  fetchJobTask,
  isFailure,
  listSlots,
  postResult,
  type Slot,
} from "@/lib/services";
import { AddressLink, StateBadge } from "./ui";
import { TxAction } from "./TxAction";
import { CopyLine } from "./CopyLine";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export type ExecutorAssignment = {
  jobId: Hex;
  /** Known when this browser also posted the job, or after loading the spec. */
  facility?: string;
  notAfter?: number;
  boardId?: string;
};

/**
 * A job someone funded naming you as the executor: the hunt, the capture, and
 * the on-chain commitment — the executor agent's loop, driven by hand.
 *
 * The escrow names you but says nothing about *what* to hunt; those terms are
 * the requester's and travel off-chain. That is not a gap in the UI, it is the
 * protocol: get the terms wrong and your delivery fails the requester's
 * verification, which is exactly what should happen.
 */
export function ExecutorJobCard({
  assignment,
  viewer,
}: {
  assignment: ExecutorAssignment;
  viewer: Address;
}) {
  const { writeContractAsync } = useWriteContract();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const [slotSourceUrl, setSlotSourceUrl] = useState(DEFAULT_SLOT_SOURCE);
  const [boardUrl, setBoardUrl] = useState(DEFAULT_JOB_BOARD);
  const [boardId, setBoardId] = useState(assignment.boardId ?? "");
  const [facility, setFacility] = useState(assignment.facility ?? "");
  const [notAfterIso, setNotAfterIso] = useState(
    assignment.notAfter ? toDateInput(assignment.notAfter) : "",
  );

  const [slots, setSlots] = useState<Slot[]>();
  const [claim, setClaim] = useState<SlotClaim>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onChain = useReadContract({
    abi: jobEscrowAbi,
    address: JOB_ESCROW,
    functionName: "getJob",
    args: [assignment.jobId],
    query: { refetchInterval: 8000 },
  });

  const state = (onChain.data?.state ?? EscrowState.None) as EscrowState;
  const amount = onChain.data?.amount ?? 0n;
  const deadline = onChain.data ? Number(onChain.data.deadline) : 0;
  const requester = onChain.data?.requester;
  const onChainHash = onChain.data?.resultHash;
  const delivered = Boolean(onChainHash && onChainHash !== ZERO_HASH);
  const remaining = deadline - now;

  const notAfter = useMemo(() => {
    if (notAfterIso === "") return undefined;
    const ms = Date.parse(notAfterIso);
    return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
  }, [notAfterIso]);

  const termsReady = facility.trim() !== "" && notAfter !== undefined;
  const resultHash = claim ? hashClaim(claim) : undefined;

  async function loadTerms() {
    setBusy(true);
    setStatus(undefined);
    const task = await fetchJobTask(boardUrl, boardId.trim());
    setBusy(false);
    if (isFailure(task)) {
      setStatus(task.error);
      return;
    }
    setFacility(task.facility);
    setNotAfterIso(toDateInput(task.notAfter));
    setStatus(`Loaded the requester's terms from the board.`);
  }

  async function hunt() {
    setBusy(true);
    setStatus(undefined);
    const found = await listSlots(slotSourceUrl, facility.trim());
    setBusy(false);
    if (isFailure(found)) {
      setStatus(found.error);
      setSlots(undefined);
      return;
    }
    setSlots(found);
    if (found.length === 0) {
      setStatus("No open slots right now. Slots appear and vanish — hunt again in a moment.");
    }
  }

  async function capture(slot: Slot) {
    setBusy(true);
    setStatus(undefined);
    const result = await claimSlot(slotSourceUrl, slot.id, viewer);
    setBusy(false);
    if (isFailure(result)) {
      setStatus(result.error);
      void hunt();
      return;
    }
    setClaim(result);
    setStatus("Slot captured. Commit its hash on-chain to deliver.");
  }

  async function submit(): Promise<Hex> {
    // Best-effort board notification first: the on-chain commitment below is
    // what actually delivers the job, so a board that is down must not stop it.
    if (claim && boardId.trim() !== "") {
      const posted = await postResult(boardUrl, boardId.trim(), {
        executorId: viewer,
        resultUri: claimUri(slotSourceUrl, claim.claimId),
        resultHash: hashClaim(claim),
      });
      if (isFailure(posted)) {
        setStatus(`${posted.error} Submitting on-chain anyway.`);
      }
    }
    return writeContractAsync({
      abi: jobEscrowAbi,
      address: JOB_ESCROW,
      functionName: "submitResult",
      args: [assignment.jobId, resultHash as Hex],
    });
  }

  return (
    <div className="rounded-xl border border-hairline bg-panel p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StateBadge state={state} />
        <span className="font-mono text-sm">{formatUsdc(amount)} USDC</span>
        <span className="font-mono text-xs text-muted" title={assignment.jobId}>
          job {shortHash(assignment.jobId, 8, 6)}
        </span>
        <span className="ml-auto text-xs text-muted">
          {state === EscrowState.Released ? (
            <span className="text-mint">paid</span>
          ) : state === EscrowState.Refunded ? (
            <span className="text-danger">refunded to the requester</span>
          ) : remaining <= 0 ? (
            <span className="text-danger">deadline elapsed</span>
          ) : (
            <>{formatCountdown(remaining)} left to deliver</>
          )}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        {requester ? (
          <span>
            hired by <AddressLink address={requester} />
          </span>
        ) : null}
        <span className="font-mono">deadline {formatTimestamp(deadline)}</span>
      </div>

      {state === EscrowState.Funded ? (
        <>
          {remaining <= 0 ? (
            <p className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
              The deadline has passed. You can still deliver, but the requester — or anyone — can
              trigger the refund at any moment, and the escrow will be empty when they do.
            </p>
          ) : null}

          <div className="mt-4 rounded-lg border border-hairline bg-panel2 p-4">
            <h4 className="text-sm font-bold">The requester&apos;s terms</h4>
            <p className="mt-1 text-xs text-muted">
              The escrow names you but does not carry the task. Get these from the requester — or
              load them from the job board if the job was posted there. Hunt the wrong facility and
              your delivery will fail their verification.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Facility">
                <input
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  placeholder="passport-office-krakow"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
              <Field label="Appointment no later than">
                <input
                  type="datetime-local"
                  value={notAfterIso}
                  onChange={(e) => setNotAfterIso(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Job-board id (optional)">
                <input
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  placeholder="uuid the requester posted under"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>
              <div className="flex items-end gap-2">
                <button
                  onClick={loadTerms}
                  disabled={busy || boardId.trim() === ""}
                  className="h-9 rounded-lg border border-hairline px-3 text-xs font-semibold hover:border-accent disabled:opacity-50"
                >
                  Load terms from board
                </button>
                <button
                  onClick={hunt}
                  disabled={busy || !termsReady}
                  className="h-9 rounded-lg bg-accent px-4 text-xs font-semibold text-[#06101f] disabled:opacity-50"
                >
                  {busy ? "Working…" : "Hunt for slots"}
                </button>
              </div>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-accent">Service URLs</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label="Slot source">
                  <input
                    value={slotSourceUrl}
                    onChange={(e) => setSlotSourceUrl(e.target.value)}
                    spellCheck={false}
                    className={inputClass}
                  />
                </Field>
                <Field label="Job board">
                  <input
                    value={boardUrl}
                    onChange={(e) => setBoardUrl(e.target.value)}
                    spellCheck={false}
                    className={inputClass}
                  />
                </Field>
              </div>
            </details>
          </div>

          {slots && slots.length > 0 ? (
            <div className="mt-4">
              <h4 className="text-sm font-bold">Open slots</h4>
              <ul className="mt-2 grid gap-2">
                {slots.map((slot) => {
                  const acceptable = notAfter !== undefined && slot.date <= notAfter;
                  return (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-hairline px-3 py-2"
                    >
                      <span className="font-mono text-xs">{formatTimestamp(slot.date)}</span>
                      <span className="text-xs text-muted">{slot.facility}</span>
                      <span
                        className={`text-xs ${acceptable ? "text-mint" : "text-danger"}`}
                        title="checked against the requester's cutoff"
                      >
                        {acceptable ? "satisfies the job" : "too late — would fail verification"}
                      </span>
                      <button
                        onClick={() => capture(slot)}
                        disabled={busy}
                        className="ml-auto rounded-lg border border-hairline px-3 py-1 text-xs font-semibold hover:border-accent disabled:opacity-50"
                      >
                        Claim
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {claim ? (
            <div className="mt-4 rounded-lg border border-mint/40 bg-mint/5 p-4">
              <h4 className="text-sm font-bold text-mint">Slot captured</h4>
              <div className="mt-2 grid gap-2">
                <CopyLine label="Claim id" value={claim.claimId} />
                <CopyLine label="Result URI" value={claimUri(slotSourceUrl, claim.claimId)} />
                <CopyLine label="Result hash" value={resultHash ?? ""} />
              </div>
              <p className="mt-3 text-xs text-muted">
                The hash is keccak256 of the claim&apos;s canonical JSON — the same value the
                requester will recompute. Send them the claim id so they can verify.
              </p>
              <div className="mt-3">
                <TxAction
                  label="Submit result on-chain"
                  pendingLabel="Committing the hash…"
                  tone="mint"
                  hint="commits the hash to JobEscrow — this is what makes the job releasable"
                  send={submit}
                  onConfirmed={() => void onChain.refetch()}
                />
              </div>
            </div>
          ) : null}

          {status ? <p className="mt-3 text-xs text-amber">{status}</p> : null}
        </>
      ) : null}

      {state === EscrowState.Delivered ? (
        <div className="mt-4 rounded-lg border border-hairline bg-panel2 p-4">
          <h4 className="text-sm font-bold">Delivered — waiting on the requester</h4>
          <p className="mt-1 text-xs text-muted">
            Your hash is committed. The requester now re-fetches the claim from the slot source and
            checks it before releasing. If they never do, the deadline returns their money — so
            make sure they have the claim id.
          </p>
          <div className="mt-3 grid gap-2">
            <CopyLine label="Committed hash" value={onChainHash ?? ""} />
            {claim ? <CopyLine label="Claim id" value={claim.claimId} /> : null}
          </div>
        </div>
      ) : null}

      {state === EscrowState.Released ? (
        <p className="mt-4 text-xs text-mint">
          Released — {formatUsdc(amount)} USDC landed in your wallet, and this job can now be
          recorded against your ERC-8004 reputation.
        </p>
      ) : null}

      {state === EscrowState.Refunded ? (
        <p className="mt-4 text-xs text-muted">
          Refunded to the requester. Either you did not deliver in time, or they cancelled before
          delivery. It counts against your release rate once recorded.
        </p>
      ) : null}

      {delivered && onChain.data ? (
        <p className="mt-3 font-mono text-[11px] text-muted">
          escrow says resultHash {shortHash(onChainHash as string, 12, 8)}
        </p>
      ) : null}

      {onChain.isError ? (
        <p className="mt-3 text-xs text-danger">Could not read this job from Arc.</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "mt-1 h-9 w-full rounded-lg border border-hairline bg-bg px-2 font-mono text-xs text-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-widest text-muted">{label}</span>
      {children}
    </label>
  );
}

/** `datetime-local` wants local wall-clock, not an ISO instant. */
function toDateInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
