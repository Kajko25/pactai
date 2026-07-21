import { z } from "zod";

/** Lifecycle of a job as tracked by the job board (mirrors JobEscrow.State). */
export const JobStateSchema = z.enum([
  "open", // posted, no quote accepted yet
  "quoted", // at least one quote received
  "funded", // requester funded JobEscrow
  "delivered", // executor submitted a result
  "released", // requester approved, executor paid
  "refunded", // cancelled or timed out
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const JobSchema = z.object({
  id: z.string(), // matches the on-chain jobId (bytes32, hex-encoded)
  requesterId: z.string(), // requester agent wallet address
  spec: z.string(), // task description the executor needs to fulfill
  budgetUsdc: z.number().positive(), // max the requester will pay
  deadline: z.number(), // unix seconds; also passed to JobEscrow.fund
  state: JobStateSchema,
  createdAt: z.number(),
});
export type Job = z.infer<typeof JobSchema>;

export const QuoteSchema = z.object({
  jobId: z.string(),
  executorId: z.string(), // executor agent wallet address
  priceUsdc: z.number().positive(),
  etaSeconds: z.number().positive(),
  createdAt: z.number(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const ResultSchema = z.object({
  jobId: z.string(),
  executorId: z.string(),
  resultUri: z.string(), // where the requester can fetch the deliverable
  resultHash: z.string(), // hex-encoded hash submitted to JobEscrow.submitResult
  submittedAt: z.number(),
});
export type JobResult = z.infer<typeof ResultSchema>;

export const ReputationEntrySchema = z.object({
  executorId: z.string(),
  jobId: z.string(),
  outcome: z.enum(["released", "refunded", "late"]),
  recordedAt: z.number(),
});
export type ReputationEntry = z.infer<typeof ReputationEntrySchema>;

/**
 * Requester's decision logic input: used to score a quote against an
 * executor's track record before committing budget. Kept intentionally
 * simple for the MVP — see docs/ARCHITECTURE.md step 3.
 */
export function scoreQuote(
  quote: Quote,
  reputation: ReputationEntry[],
  budgetUsdc: number,
): number {
  if (quote.priceUsdc > budgetUsdc) return -Infinity;

  const executorHistory = reputation.filter((r) => r.executorId === quote.executorId);
  const releasedCount = executorHistory.filter((r) => r.outcome === "released").length;
  const badCount = executorHistory.filter((r) => r.outcome !== "released").length;
  const reputationScore = executorHistory.length === 0
    ? 0 // no history: neutral, not penalized
    : (releasedCount - badCount) / executorHistory.length;

  const priceScore = 1 - quote.priceUsdc / budgetUsdc; // cheaper = higher score
  const etaScore = 1 / (1 + quote.etaSeconds / 3600); // faster = higher score

  return priceScore * 0.5 + reputationScore * 0.4 + etaScore * 0.1;
}
