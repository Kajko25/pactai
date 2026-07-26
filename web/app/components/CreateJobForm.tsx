"use client";

import { useMemo, useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { erc20Abi, jobEscrowAbi } from "@/lib/abi";
import { JOB_ESCROW, USDC_ADDRESS } from "@/lib/deployments";
import { formatUsdc, shortHash } from "@/lib/format";
import { newBoardId, saveJob, toChainJobId, usdcUnits, type LocalJob } from "@/lib/jobs";
import { Panel } from "./ui";
import { TxAction } from "./TxAction";

const DEFAULT_FACILITY = "passport-office-krakow";

/**
 * Posting a job the way an agent would: pick the terms, let the escrow pull
 * the USDC, and hand the executor a deadline it cannot talk its way past.
 *
 * Two approvals-worth of nuance are worth keeping visible here: the allowance
 * is set to exactly the job amount (not unlimited), and the two dates do
 * different jobs — the escrow deadline is when your money comes back, the
 * appointment cutoff is what makes a delivered slot acceptable at all.
 */
export function CreateJobForm({ onCreated }: { onCreated: (job: LocalJob) => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [boardId, setBoardId] = useState(() => newBoardId());
  const [facility, setFacility] = useState(DEFAULT_FACILITY);
  const [executor, setExecutor] = useState("");
  const [amount, setAmount] = useState("0.10");
  const [deadlineMinutes, setDeadlineMinutes] = useState("30");
  const [notAfterDays, setNotAfterDays] = useState("14");

  const jobId = useMemo(() => toChainJobId(boardId), [boardId]);

  const amountUnits = useMemo(() => {
    try {
      return usdcUnits(amount.trim() === "" ? "0" : amount.trim());
    } catch {
      return 0n;
    }
  }, [amount]);

  const allowance = useReadContract({
    abi: erc20Abi,
    address: USDC_ADDRESS,
    functionName: "allowance",
    args: address ? [address, JOB_ESCROW] : undefined,
    query: { enabled: Boolean(address) },
  });

  const balance = useReadContract({
    abi: erc20Abi,
    address: USDC_ADDRESS,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const executorValid = isAddress(executor.trim());
  const amountValid = amountUnits > 0n;
  const minutes = Number(deadlineMinutes);
  const days = Number(notAfterDays);
  const deadlineValid = Number.isFinite(minutes) && minutes >= 1;
  const notAfterValid = Number.isFinite(days) && days >= 1;
  const termsReady = executorValid && amountValid && deadlineValid && notAfterValid;

  const approved = (allowance.data ?? 0n) >= amountUnits && amountUnits > 0n;
  const shortOfFunds = balance.data !== undefined && balance.data < amountUnits;
  const executorIsSelf =
    executorValid && address ? executor.trim().toLowerCase() === address.toLowerCase() : false;

  async function approve(): Promise<Hex> {
    return writeContractAsync({
      abi: erc20Abi,
      address: USDC_ADDRESS,
      functionName: "approve",
      args: [JOB_ESCROW, amountUnits],
    });
  }

  async function fund(): Promise<Hex> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.round(minutes * 60));
    return writeContractAsync({
      abi: jobEscrowAbi,
      address: JOB_ESCROW,
      functionName: "fund",
      args: [jobId, executor.trim() as Address, amountUnits, deadline],
    });
  }

  function recordFunded(hash: Hex) {
    const job: LocalJob = {
      boardId,
      jobId,
      facility: facility.trim(),
      notAfter: Math.floor(Date.now() / 1000) + Math.round(days * 86400),
      executor: executor.trim() as Address,
      amount: amountUnits.toString(),
      deadline: Math.floor(Date.now() / 1000) + Math.round(minutes * 60),
      createdAt: Math.floor(Date.now() / 1000),
      fundTxHash: hash,
    };
    saveJob(job);
    onCreated(job);
    setBoardId(newBoardId()); // next job gets a fresh id
    void allowance.refetch();
    void balance.refetch();
  }

  return (
    <Panel>
      <h2 className="text-lg font-bold">Post a job</h2>
      <p className="mt-1 text-sm text-muted">
        Hire an executor to hunt an appointment slot. Your USDC sits in the escrow until you
        approve the result — or until the deadline hands it back.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Facility" hint="what the executor is asked to hunt">
          <input
            value={facility}
            onChange={(e) => setFacility(e.target.value)}
            spellCheck={false}
            className={inputClass}
          />
        </Field>

        <Field
          label="Executor address"
          hint={
            executorIsSelf
              ? "that is your own wallet — you would be paying yourself"
              : "the agent wallet you are hiring"
          }
          invalid={executor.trim() !== "" && !executorValid}
        >
          <input
            value={executor}
            onChange={(e) => setExecutor(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            className={inputClass}
          />
        </Field>

        <Field
          label="Amount (USDC)"
          hint={
            shortOfFunds
              ? `you hold ${formatUsdc(balance.data ?? 0n)} USDC — not enough`
              : "held by the escrow, paid only on release"
          }
          invalid={shortOfFunds}
        >
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>

        <Field label="Escrow deadline (minutes)" hint="after this, anyone can trigger your refund">
          <input
            value={deadlineMinutes}
            onChange={(e) => setDeadlineMinutes(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        <Field
          label="Appointment no later than (days)"
          hint="a captured slot after this date does not satisfy the job"
        >
          <input
            value={notAfterDays}
            onChange={(e) => setNotAfterDays(e.target.value)}
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        <Field label="Job id" hint="keccak256 of the job-board id — how the escrow addresses it">
          <div className="flex h-9 items-center rounded-lg border border-hairline bg-panel2 px-2 font-mono text-xs text-muted">
            {shortHash(jobId, 14, 10)}
          </div>
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-muted">
            Step 1 — allow the escrow
          </div>
          {approved ? (
            <p className="text-sm text-mint">
              ✓ approved for {formatUsdc(amountUnits)} USDC
            </p>
          ) : (
            <TxAction
              label={`Approve ${amountValid ? formatUsdc(amountUnits) : "0.00"} USDC`}
              tone="ghost"
              disabled={!amountValid}
              hint="exactly this job's amount, not an unlimited allowance"
              send={approve}
              onConfirmed={() => void allowance.refetch()}
            />
          )}
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-muted">
            Step 2 — fund the escrow
          </div>
          <TxAction
            label="Fund job"
            pendingLabel="Locking USDC…"
            disabled={!termsReady || !approved || shortOfFunds}
            hint={
              !termsReady
                ? "fill in the terms above"
                : !approved
                  ? "approve first"
                  : "moves the USDC into JobEscrow"
            }
            send={fund}
            onConfirmed={recordFunded}
          />
        </div>
      </div>
    </Panel>
  );
}

const inputClass =
  "mt-1 h-9 w-full rounded-lg border border-hairline bg-bg px-2 font-mono text-xs text-ink";

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-widest text-muted">{label}</span>
      {children}
      {hint ? (
        <span className={`mt-1 block text-xs ${invalid ? "text-danger" : "text-muted"}`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
