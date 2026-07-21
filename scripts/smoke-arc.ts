/**
 * Smoke test of the full PactAI/SlotScout cycle on REAL Arc Testnet:
 *
 *   requester = Circle Agent Wallet (SCA) driven via `circle wallet execute`
 *               — no private key in the process, the CLI session is the
 *               credential; gas paid from the wallet's own USDC
 *   executor  = lightweight local EOA (key in agents/executor-agent/.env)
 *
 * Happy path first (slot appears -> deliver -> verify -> release), then the
 * timeout path in real time (short deadline, no slot, wait it out, refund).
 * Deployed JobEscrow address comes from docs/deployed.json.
 *
 * Usage: bun run smoke:arc   (requires an authenticated `circle` CLI session)
 */
import type { Address, Hex } from "viem";
import {
  makeCircleEscrowClient,
  makeEscrowClient,
  usdcUnits,
  EscrowState,
  type SlotTask,
} from "@pactai/shared";
import { makeRequester } from "../agents/requester-agent/src/lib";
import { makeExecutor } from "../agents/executor-agent/src/lib";

const ROOT = new URL("..", import.meta.url).pathname;
const RPC_URL = process.env.ARC_RPC_URL ?? "https://rpc.blockdaemon.testnet.arc.network";
const CHAIN_ID = 5042002;
const JOB_BOARD_URL = "http://localhost:4002";
const SLOT_SOURCE_URL = "http://localhost:4102";
const REQUESTER_AGENT_WALLET = "0x03d1c300232c379845c1e345c4a49e607e87734e" as Address;
const USDC = "0x3600000000000000000000000000000000000000" as Address;

const deployed = await Bun.file(`${ROOT}docs/deployed.json`).json();
const ESCROW = deployed.contracts.JobEscrow.address as Address;

// Executor key lives in the executor agent's gitignored .env.
const executorEnv = await Bun.file(`${ROOT}agents/executor-agent/.env`).text();
const executorKey = executorEnv.match(/^EXECUTOR_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1] as Hex;
if (!executorKey) throw new Error("EXECUTOR_PRIVATE_KEY not found in agents/executor-agent/.env");

const children: ReturnType<typeof Bun.spawn>[] = [];
function spawn(cwd: string, env: Record<string, string>) {
  const child = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd, env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit",
  });
  children.push(child);
}

async function waitFor(url: string, label: string) {
  for (let i = 0; i < 50; i++) {
    try { await fetch(url); return; } catch { await Bun.sleep(200); }
  }
  throw new Error(`${label} did not come up`);
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  spawn(`${ROOT}services/job-board`, { PORT: "4002" });
  spawn(`${ROOT}services/slot-source`, { PORT: "4102" });
  await waitFor(`${JOB_BOARD_URL}/jobs`, "job-board");
  await waitFor(`${SLOT_SOURCE_URL}/slots`, "slot-source");

  const requesterEscrow = makeCircleEscrowClient({
    rpcUrl: RPC_URL, chainId: CHAIN_ID, circleChain: "ARC-TESTNET",
    walletAddress: REQUESTER_AGENT_WALLET, escrowAddress: ESCROW, usdcAddress: USDC,
  });
  const executorEscrow = makeEscrowClient({
    rpcUrl: RPC_URL, chainId: CHAIN_ID, privateKey: executorKey,
    escrowAddress: ESCROW, usdcAddress: USDC,
  });

  const requester = makeRequester({
    jobBoardUrl: JOB_BOARD_URL, slotSourceUrl: SLOT_SOURCE_URL, budgetCapUsdc: 1, escrow: requesterEscrow,
  });
  const executor = makeExecutor({
    jobBoardUrl: JOB_BOARD_URL, slotSourceUrl: SLOT_SOURCE_URL, quotePriceUsdc: 0.1, escrow: executorEscrow,
  });

  console.log(`[smoke] escrow ${ESCROW} on Arc Testnet`);
  console.log(`[smoke] requester (Circle agent wallet) ${requesterEscrow.address}`);
  console.log(`[smoke] executor (local EOA) ${executorEscrow.address}`);
  console.log(`[smoke] requester USDC: ${await requesterEscrow.usdcBalance()}`);

  // --- happy path -----------------------------------------------------------
  console.log("\n[smoke] === happy path on Arc: fund -> capture -> verify -> release ===");
  const task: SlotTask = {
    type: "slot-hunt",
    facility: "smoke-passport-krakow",
    notAfter: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
  };
  const job = await requester.postJob(task, 0.5, 1800);
  await executor.quoteJob(job, 300);
  const best = await requester.pickBestQuote(job);
  assert(best !== null && best.quote.priceUsdc === 0.1, "hunter's 0.1 USDC quote selected");

  await requester.fundQuote(job, best!.quote);
  const funded = await requesterEscrow.getJob(job.id);
  assert(funded.state === EscrowState.Funded, "escrow Funded on Arc (agent wallet paid)");
  assert(funded.amount === usdcUnits(0.1), "escrow holds 0.1 USDC");

  setTimeout(() => {
    fetch(`${SLOT_SOURCE_URL}/admin/spawn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ facility: task.facility }),
    });
  }, 2000);

  const outcome = await executor.workJob(job, { pollIntervalMs: 500, giveUpAtMs: Date.now() + 60_000 });
  assert(outcome !== null, "hunter captured and delivered (submitResult on Arc)");

  const verdict = await requester.verifyDelivery(job);
  assert(verdict.ok, `delivery verified vs oracle + Arc chain (${verdict.reason ?? "ok"})`);

  const executorBefore = await executorEscrow.usdcBalance();
  await requester.releaseJob(job);
  const executorAfter = await executorEscrow.usdcBalance();
  assert(executorAfter - executorBefore === usdcUnits(0.1), "hunter paid exactly 0.1 USDC");
  assert((await requesterEscrow.getJob(job.id)).state === EscrowState.Released, "state Released on Arc");
  await requester.recordOutcome(job, executorEscrow.address, "released");

  // --- timeout path, real clock --------------------------------------------
  console.log("\n[smoke] === timeout path on Arc: fund -> no slot -> wait deadline -> refund ===");
  const hopeless: SlotTask = {
    type: "slot-hunt",
    facility: "smoke-visa-warszawa",
    notAfter: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
  };
  const job2 = await requester.postJob(hopeless, 0.5, 75); // 75s real deadline
  await executor.quoteJob(job2, 300);
  const best2 = await requester.pickBestQuote(job2);
  await requester.fundQuote(job2, best2!.quote);
  assert((await requesterEscrow.getJob(job2.id)).state === EscrowState.Funded, "second escrow Funded");

  const escrowHeld = await requesterEscrow.usdcBalance(ESCROW);
  const hunt = await executor.workJob(job2, { pollIntervalMs: 500, giveUpAtMs: Date.now() + 3_000 });
  assert(hunt === null, "hunt honestly timed out");

  const waitMs = job2.deadline * 1000 - Date.now() + 5_000;
  console.log(`[smoke] waiting ${Math.ceil(waitMs / 1000)}s for the on-chain deadline (real clock)...`);
  await Bun.sleep(Math.max(0, waitMs));

  await requester.refundJob(job2);
  assert((await requesterEscrow.getJob(job2.id)).state === EscrowState.Refunded, "state Refunded on Arc");
  const escrowAfter = await requesterEscrow.usdcBalance(ESCROW);
  assert(escrowHeld - escrowAfter === usdcUnits(0.1), "escrow returned the 0.1 USDC");
  await requester.recordOutcome(job2, executorEscrow.address, "refunded");

  console.log(`\n[smoke] requester USDC after: ${await requesterEscrow.usdcBalance()} (fees only)`);
  console.log("[smoke] ALL CHECKS PASSED — full cycle proven on Arc Testnet with a Circle Agent Wallet");
}

main()
  .catch((err) => {
    console.error("\n[smoke] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) child.kill();
  });
