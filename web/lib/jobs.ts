// Job records the browser creates.
//
// JobEscrow stores money and a result hash — it does not store what was asked
// for. The agents keep that in the job board; a browser requester keeps it
// here, in localStorage, so the dashboard can show a funded job as "a passport
// slot in Kraków before 12 August" instead of a bare 32-byte id. Losing this
// store loses only the labels: the escrow, the money, and the release/refund
// rights all live on-chain and stay reachable by job id.
import { keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { USDC_DECIMALS } from "./deployments";

const STORAGE_KEY = "pactai.requester.jobs.v1";

export type LocalJob = {
  /** Job-board id (a UUID). The on-chain id is its keccak256. */
  boardId: string;
  jobId: Hex;
  facility: string;
  /** Unix seconds — latest appointment date the requester will accept. */
  notAfter: number;
  executor: Address;
  /** Raw 6-decimal USDC units, as a string (bigint does not survive JSON). */
  amount: string;
  /** Unix seconds — after this, the escrow is refundable by anyone. */
  deadline: number;
  createdAt: number;
  fundTxHash?: Hex;
};

/** Job-board ids are UUIDs; the on-chain jobId is their keccak256 — same
 *  derivation as `toChainJobId` in packages/shared, so a job created here is
 *  addressable by the agents and by `cast`. */
export function toChainJobId(boardId: string): Hex {
  return keccak256(toHex(boardId));
}

export function newBoardId(): string {
  return crypto.randomUUID();
}

export function usdcUnits(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS);
}

export function loadJobs(): LocalJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJob(job: LocalJob): void {
  const jobs = loadJobs().filter((j) => j.jobId !== job.jobId);
  jobs.unshift(job);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function forgetJob(jobId: Hex): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(loadJobs().filter((j) => j.jobId !== jobId)),
  );
}

/** The task JSON an agent would have read from the job board, for reference. */
export function taskSpec(job: LocalJob): string {
  return JSON.stringify(
    { type: "slot-hunt", facility: job.facility, notAfter: job.notAfter },
    null,
    2,
  );
}

export function secondsUntil(unixSeconds: number): number {
  return unixSeconds - Math.floor(Date.now() / 1000);
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "elapsed";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}
