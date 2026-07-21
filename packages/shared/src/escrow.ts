import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Thin viem wrapper around JobEscrow, shared by both agents and the local
 * e2e harness. Chain-agnostic on purpose: the same client drives a local
 * anvil node and Arc Testnet — only CHAIN_ID / RPC_URL change.
 */

export const jobEscrowAbi = [
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "executor", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitResult",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "requester", type: "address" },
          { name: "executor", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "deadline", type: "uint64" },
          { name: "state", type: "uint8" },
          { name: "resultHash", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

/** Mirrors JobEscrow.State. */
export enum EscrowState {
  None = 0,
  Funded = 1,
  Delivered = 2,
  Released = 3,
  Refunded = 4,
}

/** Job-board ids are UUIDs; on-chain jobId is their keccak256. */
export function toChainJobId(jobBoardId: string): Hex {
  return keccak256(toHex(jobBoardId));
}

/** USDC uses 6 decimals everywhere we run (Arc ERC-20 view and the mock). */
export function usdcUnits(amount: number): bigint {
  return parseUnits(amount.toString(), 6);
}

/**
 * The escrow surface agent logic depends on. Two implementations exist:
 * - makeEscrowClient (viem + local private key: anvil, plain EOAs)
 * - makeCircleEscrowClient (Circle CLI agent wallet — see escrowCircle.ts)
 */
export interface EscrowActor {
  address: Address;
  approveUsdc(amount: bigint): Promise<Hex>;
  usdcBalance(owner?: Address): Promise<bigint>;
  fund(jobBoardId: string, executor: Address, amount: bigint, deadline: number): Promise<Hex>;
  submitResult(jobBoardId: string, resultHash: Hex): Promise<Hex>;
  release(jobBoardId: string): Promise<Hex>;
  refund(jobBoardId: string): Promise<Hex>;
  getJob(jobBoardId: string): Promise<{
    requester: Address;
    executor: Address;
    amount: bigint;
    deadline: bigint;
    state: number;
    resultHash: Hex;
  }>;
}

export interface EscrowClientConfig {
  rpcUrl: string;
  chainId: number;
  privateKey: Hex;
  escrowAddress: Address;
  usdcAddress: Address;
}

export function makeEscrowClient(config: EscrowClientConfig) {
  // defineChain instead of a named viem/chains import so the exact same
  // code path serves anvil (31337) and Arc Testnet (5042002).
  const chain = defineChain({
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const account = privateKeyToAccount(config.privateKey);
  // Public Arc RPC rate-limits aggressively — poll gently and retry with
  // backoff instead of hammering it.
  const transport = http(config.rpcUrl, { retryCount: 6, retryDelay: 2000 });
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 3000 });
  const walletClient = createWalletClient({ chain, transport, account });

  async function write(
    address: Address,
    abi: typeof jobEscrowAbi | typeof erc20Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Hex> {
    const { request } = await publicClient.simulateContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
      args: args as never,
      account,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  return {
    address: account.address,
    publicClient,
    walletClient,

    approveUsdc(amount: bigint): Promise<Hex> {
      return write(config.usdcAddress, erc20Abi, "approve", [config.escrowAddress, amount]);
    },

    usdcBalance(owner?: Address): Promise<bigint> {
      return publicClient.readContract({
        address: config.usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner ?? account.address],
      });
    },

    fund(jobBoardId: string, executor: Address, amount: bigint, deadline: number): Promise<Hex> {
      return write(config.escrowAddress, jobEscrowAbi, "fund", [
        toChainJobId(jobBoardId),
        executor,
        amount,
        BigInt(deadline),
      ]);
    },

    submitResult(jobBoardId: string, resultHash: Hex): Promise<Hex> {
      return write(config.escrowAddress, jobEscrowAbi, "submitResult", [
        toChainJobId(jobBoardId),
        resultHash,
      ]);
    },

    release(jobBoardId: string): Promise<Hex> {
      return write(config.escrowAddress, jobEscrowAbi, "release", [toChainJobId(jobBoardId)]);
    },

    refund(jobBoardId: string): Promise<Hex> {
      return write(config.escrowAddress, jobEscrowAbi, "refund", [toChainJobId(jobBoardId)]);
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

export type EscrowClient = ReturnType<typeof makeEscrowClient>;
