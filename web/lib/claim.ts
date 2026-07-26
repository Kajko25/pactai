// Requester-side verification, in the browser.
//
// This is the same check the requester agent runs in
// `agents/requester-agent/src/lib.ts` before it releases payment: re-fetch the
// claim from the slot source (never trust the executor's copy), hash its
// canonical JSON, and compare against what is on-chain.
//
// The hashing below is deliberately a copy of `packages/shared/src/slot.ts`
// rather than an import: that package's barrel also exports the Circle CLI
// escrow client, which shells out via node:child_process and cannot be
// bundled for the browser. The duplication is self-detecting — if these two
// implementations ever drift, every verification in the UI immediately shows
// a hash mismatch against the chain.
import { keccak256, toHex, type Hex } from "viem";

export type SlotClaim = {
  claimId: string;
  slotId: string;
  facility: string;
  date: number;
  claimant: string;
  claimedAt: number;
};

export type SlotTask = {
  facility: string;
  notAfter: number;
};

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

export function hashClaim(claim: SlotClaim): Hex {
  return keccak256(toHex(canonicalJson(claim)));
}

/** One line of the verification checklist the user actually reads. */
export type ProofCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type ProofVerdict = {
  checks: ProofCheck[];
  ok: boolean;
  computedHash: Hex;
};

/**
 * Turns a claim + the job's terms into the four questions a human needs
 * answered before paying: is this the document the executor committed to, is
 * it for the right place, is the appointment early enough, and did the agent
 * we hired capture it.
 */
export function verifyClaim(
  claim: SlotClaim,
  onChainResultHash: Hex,
  task: SlotTask,
  executor: string,
): ProofVerdict {
  const computedHash = hashClaim(claim);

  const checks: ProofCheck[] = [
    {
      label: "Matches the hash committed on-chain",
      ok: computedHash.toLowerCase() === onChainResultHash.toLowerCase(),
      detail:
        computedHash.toLowerCase() === onChainResultHash.toLowerCase()
          ? "The claim you are reading is byte-for-byte the one the executor committed to."
          : `Computed ${computedHash.slice(0, 18)}… but the chain says ${onChainResultHash.slice(0, 18)}…`,
    },
    {
      label: "Right facility",
      ok: claim.facility === task.facility,
      detail:
        claim.facility === task.facility
          ? claim.facility
          : `claim is for ${claim.facility}, the job asked for ${task.facility}`,
    },
    {
      label: "Appointment is early enough",
      ok: claim.date <= task.notAfter,
      detail:
        claim.date <= task.notAfter
          ? `${formatDate(claim.date)} — on or before the ${formatDate(task.notAfter)} you required`
          : `${formatDate(claim.date)} is after the ${formatDate(task.notAfter)} you required`,
    },
    {
      label: "Captured by the executor you hired",
      ok: claim.claimant.toLowerCase() === executor.toLowerCase(),
      detail:
        claim.claimant.toLowerCase() === executor.toLowerCase()
          ? claim.claimant
          : `claimed by ${claim.claimant}, but the job was funded for ${executor}`,
    },
  ];

  return { checks, ok: checks.every((c) => c.ok), computedHash };
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

/** Loose parse — the claim comes from outside, so shape is checked, not assumed. */
export function parseClaim(raw: string): SlotClaim | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "That is not valid JSON." };
  }
  const c = value as Partial<SlotClaim>;
  const missing = (["claimId", "slotId", "facility", "date", "claimant", "claimedAt"] as const).filter(
    (k) => c[k] === undefined,
  );
  if (missing.length > 0) {
    return { error: `Claim is missing: ${missing.join(", ")}` };
  }
  return {
    claimId: String(c.claimId),
    slotId: String(c.slotId),
    facility: String(c.facility),
    date: Number(c.date),
    claimant: String(c.claimant),
    claimedAt: Number(c.claimedAt),
  };
}
