// Arc Testnet is not a chain any wallet library ships by default, so PactAI
// defines it here and hands the same definition to wagmi and to the read-only
// server client.
import { createPublicClient, defineChain, http } from "viem";
import { ARC_CHAIN_ID, DEFAULT_RPC_URL, EXPLORER_URL } from "./deployments";

const RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? DEFAULT_RPC_URL;

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  // Arc's gas token is USDC. The native balance carries 18 decimals; the
  // ERC-20 view at 0x3600… is the 6-decimal one. Never add the two together.
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Arcscan", url: EXPLORER_URL } },
  testnet: true,
});

/** Read-only client for server components. The public RPC rate-limits hard,
 *  so keep call counts low and prefer the explorer API for log history. */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL, { batch: true, retryCount: 3, retryDelay: 400 }),
});
