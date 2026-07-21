import {
  hashClaim,
  parseSlotTask,
  SlotClaimSchema,
  SlotSchema,
  type EscrowActor,
  type Job,
  type JobResult,
  type Quote,
  type Slot,
  type SlotClaim,
  type SlotTask,
} from "@pactai/shared";
import { z } from "zod";

/**
 * Executor-side protocol logic (the slot hunter), independent of the LLM
 * loop — shared by the Claude Agent SDK tools and the local e2e harness.
 */

export interface ExecutorConfig {
  jobBoardUrl: string;
  slotSourceUrl: string;
  quotePriceUsdc: number;
  escrow: EscrowActor;
}

export function makeExecutor(cfg: ExecutorConfig) {
  async function jsonOrThrow(res: Response): Promise<unknown> {
    if (!res.ok) throw new Error(`${res.url} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }

  return {
    address: cfg.escrow.address,

    async listOpenJobs(): Promise<Job[]> {
      return jsonOrThrow(await fetch(`${cfg.jobBoardUrl}/jobs?state=open`)) as Promise<Job[]>;
    },

    /** Quote a job at this hunter's fixed price (MVP: no dynamic pricing yet). */
    async quoteJob(job: Job, etaSeconds: number): Promise<Quote> {
      const quote: Quote = {
        jobId: job.id,
        executorId: cfg.escrow.address,
        priceUsdc: cfg.quotePriceUsdc,
        etaSeconds,
        createdAt: Date.now(),
      };
      return jsonOrThrow(
        await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}/quotes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(quote),
        }),
      ) as Promise<Quote>;
    },

    async isFunded(job: Job): Promise<boolean> {
      const fresh = (await jsonOrThrow(await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}`))) as Job;
      return fresh.state === "funded";
    },

    /**
     * The actual work: poll the slot source until a matching slot appears,
     * then race to claim it. Returns null if the hunt times out — that is a
     * legitimate outcome (the requester's escrow refunds after the deadline).
     */
    async huntSlot(
      task: SlotTask,
      opts: { pollIntervalMs: number; giveUpAtMs: number },
    ): Promise<SlotClaim | null> {
      while (Date.now() < opts.giveUpAtMs) {
        const slots = z
          .array(SlotSchema)
          .parse(await jsonOrThrow(await fetch(`${cfg.slotSourceUrl}/slots?facility=${task.facility}`)));
        const match = slots.find((s: Slot) => s.date <= task.notAfter);
        if (match) {
          // Race to claim — another hunter may beat us to it (409), in which
          // case we keep hunting.
          const res = await fetch(`${cfg.slotSourceUrl}/slots/${match.id}/claim`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ claimant: cfg.escrow.address }),
          });
          if (res.ok) return SlotClaimSchema.parse(await res.json());
        }
        await new Promise((r) => setTimeout(r, opts.pollIntervalMs));
      }
      return null;
    },

    /**
     * Deliver a captured slot: post the claim to the job board and commit its
     * canonical hash on-chain via JobEscrow.submitResult. The requester
     * verifies the hash against the oracle before releasing payment.
     */
    async deliver(job: Job, claim: SlotClaim): Promise<{ result: JobResult; submitTx: string }> {
      const result: JobResult = {
        jobId: job.id,
        executorId: cfg.escrow.address,
        resultUri: `${cfg.slotSourceUrl}/claims/${claim.claimId}`,
        resultHash: hashClaim(claim),
        submittedAt: Date.now(),
      };
      await jsonOrThrow(
        await fetch(`${cfg.jobBoardUrl}/jobs/${job.id}/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(result),
        }),
      );
      const submitTx = await cfg.escrow.submitResult(job.id, result.resultHash as `0x${string}`);
      return { result, submitTx };
    },

    /** Convenience for the SDK loop: hunt + deliver for one funded job. */
    async workJob(job: Job, opts: { pollIntervalMs: number; giveUpAtMs: number }) {
      const task = parseSlotTask(job.spec);
      const claim = await this.huntSlot(task, opts);
      if (!claim) return null;
      return this.deliver(job, claim);
    },
  };
}

export type Executor = ReturnType<typeof makeExecutor>;
