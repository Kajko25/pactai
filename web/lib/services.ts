// Browser clients for the two off-chain services an executor touches.
//
// Neither is required for the escrow to work — the chain is the source of
// truth for money and for what was committed. The slot source is the world
// the executor hunts in; the job board is where the agents coordinate. Both
// are optional here, and every call reports failure as a value rather than
// throwing, so a dashboard on a laptop with nothing else running degrades to
// "you can still submit a hash you computed elsewhere".
import type { SlotClaim } from "./claim";

export const DEFAULT_SLOT_SOURCE =
  process.env.NEXT_PUBLIC_SLOT_SOURCE_URL ?? "http://localhost:4100";
export const DEFAULT_JOB_BOARD = process.env.NEXT_PUBLIC_JOB_BOARD_URL ?? "http://localhost:4000";

export type Slot = {
  id: string;
  facility: string;
  date: number;
  postedAt: number;
};

export type Failure = { error: string };

export function isFailure<T>(value: T | Failure): value is Failure {
  return typeof value === "object" && value !== null && "error" in value;
}

function trim(url: string): string {
  return url.replace(/\/$/, "");
}

function unreachable(url: string, what: string): Failure {
  return { error: `Could not reach the ${what} at ${url}.` };
}

/** Open slots at a facility — the executor's hunting ground. */
export async function listSlots(baseUrl: string, facility: string): Promise<Slot[] | Failure> {
  try {
    const res = await fetch(`${trim(baseUrl)}/slots?facility=${encodeURIComponent(facility)}`);
    if (!res.ok) return { error: `Slot source returned ${res.status}.` };
    return (await res.json()) as Slot[];
  } catch {
    return unreachable(baseUrl, "slot source");
  }
}

/**
 * Race to claim a slot. A 409 is not an error in the protocol sense — it
 * means another hunter got there first, which is the entire reason this
 * market exists.
 */
export async function claimSlot(
  baseUrl: string,
  slotId: string,
  claimant: string,
): Promise<SlotClaim | Failure> {
  try {
    const res = await fetch(`${trim(baseUrl)}/slots/${slotId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimant }),
    });
    if (res.status === 409 || res.status === 404) {
      return { error: "Another hunter claimed that slot first." };
    }
    if (!res.ok) return { error: `Slot source returned ${res.status}.` };
    return (await res.json()) as SlotClaim;
  } catch {
    return unreachable(baseUrl, "slot source");
  }
}

/** The requester's terms, if the job was posted to a board this browser can see. */
export async function fetchJobTask(
  boardUrl: string,
  boardId: string,
): Promise<{ facility: string; notAfter: number } | Failure> {
  try {
    const res = await fetch(`${trim(boardUrl)}/jobs/${boardId}`);
    if (!res.ok) {
      return {
        error: res.status === 404 ? "The board has no job with that id." : `Board returned ${res.status}.`,
      };
    }
    const job = (await res.json()) as { spec?: string };
    if (!job.spec) return { error: "That job has no spec attached." };
    const spec = JSON.parse(job.spec) as { facility?: string; notAfter?: number };
    if (!spec.facility || !spec.notAfter) return { error: "The job spec is not a slot-hunt task." };
    return { facility: spec.facility, notAfter: spec.notAfter };
  } catch {
    return unreachable(boardUrl, "job board");
  }
}

/**
 * Tell the board what was delivered, so an agent-side requester can find the
 * claim without being handed the id by hand. Best-effort on purpose: the
 * on-chain `submitResult` is the commitment that matters, and it must not be
 * held hostage to a dev service being up.
 */
export async function postResult(
  boardUrl: string,
  boardId: string,
  body: { executorId: string; resultUri: string; resultHash: string },
): Promise<true | Failure> {
  try {
    const res = await fetch(`${trim(boardUrl)}/jobs/${boardId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: boardId,
        executorId: body.executorId,
        resultUri: body.resultUri,
        resultHash: body.resultHash,
        submittedAt: Date.now(),
      }),
    });
    if (!res.ok) return { error: `Board returned ${res.status}.` };
    return true;
  } catch {
    return unreachable(boardUrl, "job board");
  }
}

export function claimUri(slotSourceUrl: string, claimId: string): string {
  return `${trim(slotSourceUrl)}/claims/${claimId}`;
}
