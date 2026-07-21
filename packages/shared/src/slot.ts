import { z } from "zod";
import { keccak256, toHex } from "viem";

/**
 * SlotScout task vocabulary — the one task type the MVP executor supports
 * (docs/PLAN.md cut list #4): hunt a scarce appointment slot at a facility
 * and prove the capture before the job's deadline.
 */

/** What the requester asks for. Serialized as JSON into `Job.spec`. */
export const SlotTaskSchema = z.object({
  type: z.literal("slot-hunt"),
  facility: z.string(), // e.g. "passport-office-krakow"
  notAfter: z.number(), // unix seconds — latest acceptable appointment date
});
export type SlotTask = z.infer<typeof SlotTaskSchema>;

/** An open appointment slot as published by the slot source. */
export const SlotSchema = z.object({
  id: z.string(),
  facility: z.string(),
  date: z.number(), // unix seconds — when the appointment takes place
  postedAt: z.number(),
});
export type Slot = z.infer<typeof SlotSchema>;

/**
 * The claim record the slot source issues when an executor captures a slot.
 * This is the job's deliverable: its canonical hash goes on-chain via
 * `JobEscrow.submitResult`, and the requester re-fetches it from the slot
 * source (the oracle) to verify before releasing payment.
 */
export const SlotClaimSchema = z.object({
  claimId: z.string(),
  slotId: z.string(),
  facility: z.string(),
  date: z.number(),
  claimant: z.string(), // executor wallet address
  claimedAt: z.number(),
});
export type SlotClaim = z.infer<typeof SlotClaimSchema>;

/** JSON with lexicographically sorted keys, so hashes are reproducible. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/** keccak256 over the canonical JSON — the `resultHash` submitted on-chain. */
export function hashClaim(claim: SlotClaim): `0x${string}` {
  return keccak256(toHex(canonicalJson(claim)));
}

export function parseSlotTask(spec: string): SlotTask {
  return SlotTaskSchema.parse(JSON.parse(spec));
}

/**
 * Requester-side verification: does the claim (re-fetched from the slot
 * source, not trusted from the executor) actually satisfy the task?
 */
export function claimSatisfiesTask(
  claim: SlotClaim,
  task: SlotTask,
  executorAddress: string,
): { ok: boolean; reason?: string } {
  if (claim.facility !== task.facility) {
    return { ok: false, reason: `facility mismatch: ${claim.facility} != ${task.facility}` };
  }
  if (claim.date > task.notAfter) {
    return { ok: false, reason: `slot date ${claim.date} is after notAfter ${task.notAfter}` };
  }
  if (claim.claimant.toLowerCase() !== executorAddress.toLowerCase()) {
    return { ok: false, reason: `claimant ${claim.claimant} is not the hired executor` };
  }
  return { ok: true };
}
