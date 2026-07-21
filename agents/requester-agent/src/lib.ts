import {
  claimSatisfiesTask,
  hashClaim,
  parseSlotTask,
  scoreQuote,
  usdcUnits,
  EscrowState,
  SlotClaimSchema,
  type EscrowActor,
  type Job,
  type JobResult,
  type Quote,
  type ReputationEntry,
  type SlotTask,
} from "@pactai/shared";
import type { Address } from "viem";

/**
 * Requester-side protocol logic, independent of the LLM loop so the exact
 * same code drives the Claude Agent SDK tools (index.ts) and the
 * deterministic local e2e harness (scripts/e2e-local.ts).
 */

export interface RequesterConfig {
  jobBoardUrl: string;
  slotSourceUrl: string;
  budgetCapUsdc: number;
  escrow: EscrowActor;
}

export function makeRequester(cfg: RequesterConfig) {
  async function jsonOrThrow(res: Response): Promise<unknown> {
    if (!res.ok) throw new Error(`${res.url} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }

  return {
    address: cfg.escrow.address,

    /** Post a slot-hunt job. `budgetUsdc` is clamped to the agent's cap. */
    async postJob(task: SlotTask, budgetUsdc: number, deadlineSeconds: number): Promise<Job> {
      const job: Job = {
        id: crypto.randomUUID(),
        requesterId: cfg.escrow.address,
        spec: JSON.stringify(task),
        budgetUsdc: Math.min(budgetUsdc, cfg.budgetCapUsdc),
        deadline: Math.floor(Date.now() / 1000) + deadlineSeconds,
        state: "open",
        createdAt: Date.now(),
      };
      return jsonOrThrow(
        await fetch(`${cfg.jobBoardUrl}/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(job),
        }),
      ) as Promise<Job>;
    },

    async listQuotes(jobId: string): Promise<Quote[]> {
      return jsonOrThrow(await fetch(`${cfg.jobBoardUrl}/jobs/${jobId}/quotes`)) as Promise<Quote[]>;
    },

    /** Score all quotes for a job (price + reputation + ETA) and pick the best affordable one. */
    async pickBestQuote(job: Job): Promise<{ quote: Quote; score: number } | null> {
      const [quotes, reputation] = await Promise.all([
        this.listQuotes(job.id),
        jsonOrThrow(await fetch(`${cfg.jobBoardUrl}/reputation`)) as Promise<ReputationEntry[]>,
      ]);
      let best: { quote: Quote; score: number } | null = null;
      for (const quote of quotes) {
        const score = scoreQuote(quote, reputation, job.budgetUsdc);
        if (score === -Infinity) continue;
        if (!best || score > best.score) best = { quote, score };
      }
      return best;
    },

    /**
     * SPEND ACTION — moves USDC from this agent's wallet into JobEscrow.
     * The on-chain deadline mirrors the job-board deadline, so the timeout
     * refund path needs no oracle: the chain clock is the arbiter.
     */
    async fundQuote(job: Job, quote: Quote): Promise<{ approveTx: string; fundTx: string }> {
      const amount = usdcUnits(quote.priceUsdc);
      const approveTx = await cfg.escrow.approveUsdc(amount);
      const fundTx = await cfg.escrow.fund(job.id, quote.executorId as Address, amount, job.deadline);
      await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "funded" }),
      });
      return { approveTx, fundTx };
    },

    /**
     * Verify a delivery without trusting the executor:
     * 1. re-fetch the claim from the slot source (the oracle) by claimId —
     *    never from a URI the executor controls,
     * 2. its canonical hash must equal both the job-board resultHash and the
     *    on-chain resultHash committed via submitResult,
     * 3. the claim must actually satisfy the task (facility, date, claimant).
     */
    async verifyDelivery(job: Job): Promise<{ ok: boolean; reason?: string }> {
      const result = (await jsonOrThrow(
        await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}/result`),
      )) as JobResult;

      const claimId = result.resultUri.split("/").pop();
      const claimRes = await fetch(`${cfg.slotSourceUrl}/claims/${claimId}`);
      if (!claimRes.ok) return { ok: false, reason: `claim ${claimId} not found at slot source` };
      const claim = SlotClaimSchema.parse(await claimRes.json());

      const expectedHash = hashClaim(claim);
      if (expectedHash !== result.resultHash) {
        return { ok: false, reason: "job-board resultHash does not match oracle claim" };
      }
      const onChain = await cfg.escrow.getJob(job.id);
      if (onChain.state !== EscrowState.Delivered) {
        return { ok: false, reason: `on-chain state is ${EscrowState[onChain.state]}, not Delivered` };
      }
      if (onChain.resultHash !== expectedHash) {
        return { ok: false, reason: "on-chain resultHash does not match oracle claim" };
      }
      return claimSatisfiesTask(claim, parseSlotTask(job.spec), onChain.executor);
    },

    /** SPEND ACTION — releases escrowed USDC to the executor. */
    async releaseJob(job: Job): Promise<string> {
      const tx = await cfg.escrow.release(job.id);
      await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "released" }),
      });
      return tx;
    },

    /** Refund path: requester cancel (pre-delivery) or post-deadline timeout. */
    async refundJob(job: Job): Promise<string> {
      const tx = await cfg.escrow.refund(job.id);
      await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "refunded" }),
      });
      return tx;
    },

    /** Outcome feeds back into future pickBestQuote calls via scoreQuote. */
    async recordOutcome(job: Job, executorId: string, outcome: ReputationEntry["outcome"]) {
      const entry: ReputationEntry = {
        executorId,
        jobId: job.id,
        outcome,
        recordedAt: Date.now(),
      };
      await fetch(`${cfg.jobBoardUrl}/reputation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry),
      });
      return entry;
    },
  };
}

export type Requester = ReturnType<typeof makeRequester>;
