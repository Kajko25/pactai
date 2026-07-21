import { execFileSync } from "node:child_process";
import { createPublicClient, defineChain, erc20Abi, http, type Address, type Hex } from "viem";
import { jobEscrowAbi, toChainJobId, type EscrowActor } from "./escrow";

/**
 * EscrowActor implementation backed by a Circle Agent Wallet through the
 * Circle CLI (`circle wallet execute`) — the same execFileSync-to-circle-cli
 * pattern as Circle's official claude-agent-sdk starter kit. Writes go
 * through Circle's infrastructure (the wallet is an agent-controlled SCA;
 * gas is paid from the wallet's own USDC, Arc's native gas token); reads
 * stay on a plain viem public client.
 *
 * Requires an authenticated `circle` CLI session (email OTP, `circle wallet
 * status` to check) — there is no private key anywhere in the process env.
 */

export interface CircleEscrowConfig {
  rpcUrl: string;
  chainId: number;
  /** Circle CLI chain name, e.g. "ARC-TESTNET". */
  circleChain: string;
  /** The agent wallet address (from `circle wallet list`). */
  walletAddress: Address;
  escrowAddress: Address;
  usdcAddress: Address;
}

export function makeCircleEscrowClient(config: CircleEscrowConfig): EscrowActor {
  const chain = defineChain({
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  // Same gentle polling/backoff as the viem client — Arc's public RPC
  // rate-limits aggressively.
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { retryCount: 6, retryDelay: 2000 }),
    pollingInterval: 3000,
  });

  function execute(contract: Address, signature: string, args: string[]): Hex {
    const stdout = execFileSync(
      "circle",
      [
        "wallet", "execute", signature, ...args,
        "--contract", contract,
        "--address", config.walletAddress,
        "--chain", config.circleChain,
        "--output", "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const parsed = JSON.parse(stdout) as { data?: { state?: string; txHash?: string } };
    const txHash = parsed.data?.txHash;
    if (!txHash) {
      throw new Error(`circle wallet execute returned no txHash (state=${parsed.data?.state}): ${stdout}`);
    }
    return txHash as Hex;
  }

  async function write(contract: Address, signature: string, args: string[]): Promise<Hex> {
    const txHash = execute(contract, signature, args);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`agent-wallet tx reverted: ${txHash}`);
    }
    return txHash;
  }

  return {
    address: config.walletAddress,

    approveUsdc(amount: bigint) {
      return write(config.usdcAddress, "approve(address,uint256)", [
        config.escrowAddress,
        amount.toString(),
      ]);
    },

    usdcBalance(owner?: Address) {
      return publicClient.readContract({
        address: config.usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner ?? config.walletAddress],
      });
    },

    fund(jobBoardId: string, executor: Address, amount: bigint, deadline: number) {
      return write(config.escrowAddress, "fund(bytes32,address,uint256,uint64)", [
        toChainJobId(jobBoardId),
        executor,
        amount.toString(),
        deadline.toString(),
      ]);
    },

    submitResult(jobBoardId: string, resultHash: Hex) {
      return write(config.escrowAddress, "submitResult(bytes32,bytes32)", [
        toChainJobId(jobBoardId),
        resultHash,
      ]);
    },

    release(jobBoardId: string) {
      return write(config.escrowAddress, "release(bytes32)", [toChainJobId(jobBoardId)]);
    },

    refund(jobBoardId: string) {
      return write(config.escrowAddress, "refund(bytes32)", [toChainJobId(jobBoardId)]);
    },

    async getJob(jobBoardId: string) {
      return publicClient.readContract({
        address: config.escrowAddress,
        abi: jobEscrowAbi,
        functionName: "getJob",
        args: [toChainJobId(jobBoardId)],
      });
    },
  };
}
