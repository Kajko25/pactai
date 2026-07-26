import { formatUnits } from "viem";
import { USDC_DECIMALS } from "./deployments";

/** Mirrors JobEscrow.State. */
export enum EscrowState {
  None = 0,
  Funded = 1,
  Delivered = 2,
  Released = 3,
  Refunded = 4,
}

export const ESCROW_STATE_LABEL: Record<EscrowState, string> = {
  [EscrowState.None]: "Unknown",
  [EscrowState.Funded]: "Funded",
  [EscrowState.Delivered]: "Delivered",
  [EscrowState.Released]: "Released",
  [EscrowState.Refunded]: "Refunded",
};

/** Mirrors JobReputationRegistry.Outcome. */
export const OUTCOME_LABEL: Record<number, string> = {
  0: "None",
  1: "Released",
  2: "Refunded",
};

export function formatUsdc(amount: bigint): string {
  const value = Number(formatUnits(amount, USDC_DECIMALS));
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function shortHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function formatTimestamp(seconds: number | bigint): string {
  const ms = Number(seconds) * 1000;
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
