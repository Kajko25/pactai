// bigint does not survive the trip to a client component cleanly, so job rows
// are flattened to strings at the server/client boundary.
import type { Address, Hex } from "viem";
import type { JobRow } from "./activity";

export type ClientJob = {
  jobId: Hex;
  requester: Address;
  executor: Address;
  amount: string; // raw 6-decimal units
  deadline: number;
  state: number;
  resultHash?: Hex;
  fundedAt: string;
  settledAt?: string;
  reputationOutcome?: number;
  events: {
    name: string;
    txHash: Hex;
    blockNumber: number;
    timestamp: string;
  }[];
};

export function toClientJobs(jobs: JobRow[]): ClientJob[] {
  return jobs.map((job) => ({
    jobId: job.jobId,
    requester: job.requester,
    executor: job.executor,
    amount: job.amount.toString(),
    deadline: job.deadline,
    state: job.state,
    resultHash: job.resultHash,
    fundedAt: job.fundedAt,
    settledAt: job.settledAt,
    reputationOutcome: job.reputationOutcome,
    events: job.events.map((e) => ({
      name: e.name,
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
    })),
  }));
}
