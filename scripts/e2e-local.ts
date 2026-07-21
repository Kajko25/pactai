/**
 * Local end-to-end run of the full PactAI/SlotScout cycle, no LLM involved:
 * it drives the same lib.ts logic the Claude Agent SDK tools wrap, so a green
 * run here proves the whole protocol plumbing before anything touches Arc.
 *
 *   1. spawn anvil, deploy MockUSDC + JobEscrow (artifacts from forge build)
 *   2. spawn job-board (:4001) and slot-source (:4101)
 *   3. HAPPY PATH: post job -> quote -> score -> fund -> slot appears ->
 *      hunter claims -> deliver (board + chain) -> verify vs oracle ->
 *      release -> executor paid, reputation recorded
 *   4. TIMEOUT PATH: post job -> quote -> fund -> no slot ever appears ->
 *      warp chain past the deadline -> refund -> requester made whole
 *
 * Usage: bun run e2e   (from the repo root; needs `forge build` run once)
 */
import { createTestClient, http, parseUnits, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import {
  makeEscrowClient,
  usdcUnits,
  EscrowState,
  type SlotTask,
} from "@pactai/shared";
import { makeRequester } from "../agents/requester-agent/src/lib";
import { makeExecutor } from "../agents/executor-agent/src/lib";

const ROOT = new URL("..", import.meta.url).pathname;
const RPC_URL = "http://127.0.0.1:8545";
const JOB_BOARD_URL = "http://localhost:4001";
const SLOT_SOURCE_URL = "http://localhost:4101";

// Canonical anvil dev accounts — test-only keys, never used outside anvil.
const DEPLOYER_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REQUESTER_KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const EXECUTOR_KEY: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const children: ReturnType<typeof Bun.spawn>[] = [];

function spawn(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push(child);
  return child;
}

async function waitFor(url: string, label: string, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`${label} did not come up at ${url}`);
}

async function loadArtifact(path: string): Promise<{ abi: unknown[]; bytecode: Hex }> {
  const artifact = await Bun.file(`${ROOT}contracts/out/${path}`).json();
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  // --- 1. chain + contracts -------------------------------------------------
  spawn(["anvil", "--silent"], ROOT);
  await waitFor(RPC_URL, "anvil");

  const deployer = makeEscrowClient({
    rpcUrl: RPC_URL,
    chainId: foundry.id,
    privateKey: DEPLOYER_KEY,
    // placeholder addresses; deployer client is only used for its wallet here
    escrowAddress: "0x0000000000000000000000000000000000000000",
    usdcAddress: "0x0000000000000000000000000000000000000000",
  });

  async function deploy(artifactPath: string, args: unknown[]): Promise<Address> {
    const { abi, bytecode } = await loadArtifact(artifactPath);
    const hash = await deployer.walletClient.deployContract({
      abi: abi as never,
      bytecode,
      args: args as never,
    });
    const receipt = await deployer.publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress!;
  }

  const usdcAddress = await deploy("JobEscrow.t.sol/MockUSDC.json", []);
  const escrowAddress = await deploy("JobEscrow.sol/JobEscrow.json", [usdcAddress]);
  console.log(`[e2e] MockUSDC ${usdcAddress}, JobEscrow ${escrowAddress}`);

  const requesterEscrow = makeEscrowClient({
    rpcUrl: RPC_URL, chainId: foundry.id, privateKey: REQUESTER_KEY, escrowAddress, usdcAddress,
  });
  const executorEscrow = makeEscrowClient({
    rpcUrl: RPC_URL, chainId: foundry.id, privateKey: EXECUTOR_KEY, escrowAddress, usdcAddress,
  });

  // Mint the requester agent its working capital: 10 USDC.
  const { abi: usdcAbi } = await loadArtifact("JobEscrow.t.sol/MockUSDC.json");
  const mintHash = await deployer.walletClient.writeContract({
    address: usdcAddress,
    abi: usdcAbi as never,
    functionName: "mint" as never,
    args: [requesterEscrow.address, parseUnits("10", 6)] as never,
  });
  await deployer.publicClient.waitForTransactionReceipt({ hash: mintHash });

  // --- 2. services ----------------------------------------------------------
  spawn(["bun", "run", "src/server.ts"], `${ROOT}services/job-board`, { PORT: "4001" });
  spawn(["bun", "run", "src/server.ts"], `${ROOT}services/slot-source`, { PORT: "4101" });
  await waitFor(`${JOB_BOARD_URL}/jobs`, "job-board");
  await waitFor(`${SLOT_SOURCE_URL}/slots`, "slot-source");

  const requester = makeRequester({
    jobBoardUrl: JOB_BOARD_URL, slotSourceUrl: SLOT_SOURCE_URL, budgetCapUsdc: 5, escrow: requesterEscrow,
  });
  const executor = makeExecutor({
    jobBoardUrl: JOB_BOARD_URL, slotSourceUrl: SLOT_SOURCE_URL, quotePriceUsdc: 2, escrow: executorEscrow,
  });

  // --- 3. HAPPY PATH --------------------------------------------------------
  console.log("\n[e2e] === happy path: slot found -> deliver -> verify -> release ===");
  const task: SlotTask = {
    type: "slot-hunt",
    facility: "passport-office-krakow",
    notAfter: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
  };
  const job = await requester.postJob(task, 3, 3600);
  console.log(`[e2e] job posted ${job.id} (budget clamped to ${job.budgetUsdc} USDC)`);

  await executor.quoteJob(job, 600);
  const best = await requester.pickBestQuote(job);
  assert(best !== null && best.quote.executorId === executorEscrow.address, "best quote is the hunter's");

  await requester.fundQuote(job, best!.quote);
  const funded = await requesterEscrow.getJob(job.id);
  assert(funded.state === EscrowState.Funded, "on-chain state is Funded");
  assert(funded.amount === usdcUnits(2), "escrow holds exactly the quoted 2 USDC");
  assert(await executor.isFunded(job), "job board shows funded");

  // The real-world signal: a slot appears at the agency 1.5s into the hunt.
  setTimeout(() => {
    fetch(`${SLOT_SOURCE_URL}/admin/spawn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ facility: task.facility }),
    });
  }, 1500);

  const outcome = await executor.workJob(job, { pollIntervalMs: 300, giveUpAtMs: Date.now() + 30_000 });
  assert(outcome !== null, "hunter captured and delivered the slot");

  const verdict = await requester.verifyDelivery(job);
  assert(verdict.ok, `delivery verifies against oracle + chain (${verdict.reason ?? "ok"})`);

  const executorBefore = await executorEscrow.usdcBalance();
  await requester.releaseJob(job);
  const executorAfter = await executorEscrow.usdcBalance();
  assert(executorAfter - executorBefore === usdcUnits(2), "executor got paid 2 USDC");
  assert((await requesterEscrow.getJob(job.id)).state === EscrowState.Released, "on-chain state is Released");
  await requester.recordOutcome(job, executorEscrow.address, "released");

  // --- 4. TIMEOUT PATH ------------------------------------------------------
  console.log("\n[e2e] === timeout path: no slot -> deadline passes -> refund ===");
  const hopelessTask: SlotTask = {
    type: "slot-hunt",
    facility: "visa-office-warszawa", // no slot will ever appear here
    notAfter: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
  };
  const job2 = await requester.postJob(hopelessTask, 2, 60);
  await executor.quoteJob(job2, 600);
  const best2 = await requester.pickBestQuote(job2);
  assert(best2 !== null, "hunter quoted the hopeless job too");
  await requester.fundQuote(job2, best2!.quote);

  const requesterBefore = await requesterEscrow.usdcBalance();
  const hunt2 = await executor.workJob(job2, { pollIntervalMs: 200, giveUpAtMs: Date.now() + 2_000 });
  assert(hunt2 === null, "hunt honestly timed out with no slot");

  // Warp the chain past the job deadline (in prod: just wait).
  const testClient = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC_URL) });
  await testClient.setNextBlockTimestamp({ timestamp: BigInt(job2.deadline + 1) });
  await testClient.mine({ blocks: 1 });

  await requester.refundJob(job2);
  const requesterAfter = await requesterEscrow.usdcBalance();
  assert(requesterAfter - requesterBefore === usdcUnits(2), "requester made whole (2 USDC back)");
  assert((await requesterEscrow.getJob(job2.id)).state === EscrowState.Refunded, "on-chain state is Refunded");
  await requester.recordOutcome(job2, executorEscrow.address, "refunded");

  // Reputation now shows 1 release + 1 refund for this hunter.
  const rep = await (await fetch(`${JOB_BOARD_URL}/reputation/${executorEscrow.address}`)).json();
  assert(Array.isArray(rep) && rep.length === 2, "reputation ledger recorded both outcomes");

  console.log("\n[e2e] ALL CHECKS PASSED — full cycle proven locally (release + timeout refund)");
}

main()
  .catch((err) => {
    console.error("\n[e2e] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) child.kill();
  });
