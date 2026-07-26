// Single source of truth for what PactAI has on Arc Testnet.
// Mirrors docs/deployed.json — keep the two in sync when redeploying.
import type { Address, Hex } from "viem";

export const ARC_CHAIN_ID = 5042002;
export const DEFAULT_RPC_URL = "https://rpc.testnet.arc.network";
export const EXPLORER_URL = "https://testnet.arcscan.app";

/** 6-decimal ERC-20 view of Arc's native gas USDC. */
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

export const JOB_ESCROW: Address = "0x52a8C98D90F5A2feEF6AA07eBD25197456b4E4E7";
export const IDENTITY_REGISTRY: Address = "0x9bAb9a3dc64A7D449728dC5C6F5cc47Af337C1e7";
export const REPUTATION_REGISTRY: Address = "0x992aA6B918Cf7916fE1F8e43cB3E0FEb6915A835";

/** Block JobEscrow was deployed in — nothing interesting exists before it. */
export const ESCROW_DEPLOY_BLOCK = 52952483n;

/** The two agents that ran the demo cycles, for labelling addresses in the UI. */
export const KNOWN_AGENTS: Record<Lowercase<Address>, { label: string; agentId: number }> = {
  "0xa3a23dc97fcecbd8403732e7c2b3c237ce604829": { label: "SlotScout executor", agentId: 1 },
  "0x03d1c300232c379845c1e345c4a49e607e87734e": { label: "Requester (Circle agent wallet)", agentId: 2 },
};

export function agentLabel(address?: string): string | undefined {
  if (!address) return undefined;
  return KNOWN_AGENTS[address.toLowerCase() as Lowercase<Address>]?.label;
}

export function txUrl(hash: Hex | string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function addressUrl(address: Address | string): string {
  return `${EXPLORER_URL}/address/${address}`;
}
