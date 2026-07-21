/**
 * Requester agent — Claude Agent SDK entry point.
 *
 * Mirrors the shape of Circle's official `claude-agent-sdk` starter kit
 * (tools exposed via an in-process MCP server, spend-side tools gated by
 * canUseTool), with PactAI-specific tools: post a slot-hunt job, score
 * quotes, fund JobEscrow, verify the delivered claim against the oracle,
 * then release — or refund on timeout.
 *
 * All protocol logic lives in lib.ts; this file is only the LLM wiring.
 * The deterministic e2e harness (scripts/e2e-local.ts) drives lib.ts
 * directly, no API key needed.
 */
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { makeEscrowClient, type Job } from "@pactai/shared";
import { makeRequester } from "./lib";
import type { Address, Hex } from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required — see .env.example`);
    process.exit(1);
  }
  return value;
}

const requester = makeRequester({
  jobBoardUrl: process.env.JOB_BOARD_URL ?? "http://localhost:4000",
  slotSourceUrl: process.env.SLOT_SOURCE_URL ?? "http://localhost:4100",
  budgetCapUsdc: Number(process.env.BUDGET_CAP_USDC ?? 5),
  escrow: makeEscrowClient({
    rpcUrl: requireEnv("RPC_URL"),
    chainId: Number(requireEnv("CHAIN_ID")),
    privateKey: requireEnv("REQUESTER_PRIVATE_KEY") as Hex,
    escrowAddress: requireEnv("JOB_ESCROW_ADDRESS") as Address,
    usdcAddress: requireEnv("USDC_ADDRESS") as Address,
  }),
});

// In-memory cache of jobs this agent posted, so tools can refer to them by id.
const myJobs = new Map<string, Job>();

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

const postJob = tool(
  "post_job",
  "Post a slot-hunt job to the PactAI job board: hunt an appointment slot at `facility` no later than `notAfterSeconds` from now, with a USDC budget cap and an overall job deadline.",
  {
    facility: z.string().describe("Facility to hunt a slot at, e.g. passport-office-krakow"),
    notAfterSeconds: z.number().describe("Latest acceptable appointment date, seconds from now"),
    budgetUsdc: z.number().positive(),
    deadlineSeconds: z.number().positive().describe("How long the hunt may take before escrow refunds"),
  },
  async (args) => {
    const job = await requester.postJob(
      {
        type: "slot-hunt",
        facility: args.facility,
        notAfter: Math.floor(Date.now() / 1000) + args.notAfterSeconds,
      },
      args.budgetUsdc,
      args.deadlineSeconds,
    );
    myJobs.set(job.id, job);
    return text(job);
  },
);

const listQuotes = tool(
  "list_quotes",
  "List executor quotes for a job this agent posted.",
  { jobId: z.string() },
  async (args) => text(await requester.listQuotes(args.jobId)),
);

const pickBestQuote = tool(
  "pick_best_quote",
  "Score all quotes for a job (price + executor reputation + ETA) and return the best affordable one, or null if none qualify.",
  { jobId: z.string() },
  async (args) => {
    const job = myJobs.get(args.jobId);
    if (!job) return text({ error: "unknown job" });
    return text(await requester.pickBestQuote(job));
  },
);

const fundEscrow = tool(
  "fund_escrow",
  "SPEND: fund JobEscrow for an accepted quote, moving USDC from this agent's wallet into escrow. Requires approval.",
  { jobId: z.string(), executorId: z.string(), priceUsdc: z.number().positive() },
  async (args) => {
    const job = myJobs.get(args.jobId);
    if (!job) return text({ error: "unknown job" });
    const txs = await requester.fundQuote(job, {
      jobId: args.jobId,
      executorId: args.executorId,
      priceUsdc: args.priceUsdc,
      etaSeconds: 0,
      createdAt: Date.now(),
    });
    return text(txs);
  },
);

const verifyDelivery = tool(
  "verify_delivery",
  "Verify a delivered result against the slot-source oracle and the on-chain resultHash. Returns {ok, reason?}.",
  { jobId: z.string() },
  async (args) => {
    const job = myJobs.get(args.jobId);
    if (!job) return text({ error: "unknown job" });
    return text(await requester.verifyDelivery(job));
  },
);

const releaseEscrow = tool(
  "release_escrow",
  "SPEND: release escrowed USDC to the executor after verify_delivery returned ok. Requires approval.",
  { jobId: z.string() },
  async (args) => {
    const job = myJobs.get(args.jobId);
    if (!job) return text({ error: "unknown job" });
    return text({ tx: await requester.releaseJob(job) });
  },
);

const refundEscrow = tool(
  "refund_escrow",
  "Refund an unfulfilled job: cancel before delivery, or reclaim after the deadline passed with no valid delivery.",
  { jobId: z.string() },
  async (args) => {
    const job = myJobs.get(args.jobId);
    if (!job) return text({ error: "unknown job" });
    return text({ tx: await requester.refundJob(job) });
  },
);

const recordOutcome = tool(
  "record_outcome",
  "Record the job outcome (released/refunded/late) in the reputation ledger, feeding future quote scoring.",
  { jobId: z.string(), executorId: z.string(), outcome: z.enum(["released", "refunded", "late"]) },
  async (args) => {
    const job = myJobs.get(args.jobId);
    if (!job) return text({ error: "unknown job" });
    return text(await requester.recordOutcome(job, args.executorId, args.outcome));
  },
);

const server = createSdkMcpServer({
  name: "pactai-requester",
  tools: [postJob, listQuotes, pickBestQuote, fundEscrow, verifyDelivery, releaseEscrow, refundEscrow, recordOutcome],
});

// --- Human-in-the-loop spend gate -------------------------------------------
// Same pattern as Circle's starter kit: only spend-side tools pause for
// approval; everything else runs autonomously. For the recorded demo the
// gate logs and allows, keeping every USDC movement observable.
const SPEND_TOOLS = new Set(["mcp__pactai-requester__fund_escrow", "mcp__pactai-requester__release_escrow"]);

async function canUseTool(toolName: string, input: Record<string, unknown>) {
  if (SPEND_TOOLS.has(toolName)) {
    console.log(`[spend gate] approving ${toolName}`, input);
  }
  return { behavior: "allow" as const, updatedInput: input };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required — see .env.example");
    process.exit(1);
  }
  console.log(`[requester-agent] wallet ${requester.address}`);

  for await (const message of query({
    prompt:
      "You are the requester agent in PactAI (SlotScout). Post one slot-hunt job " +
      "for facility 'passport-office-krakow' with a 2 USDC budget, a 14-day " +
      "acceptable appointment window, and a 1-hour hunt deadline. Poll quotes, " +
      "pick the best one, fund escrow, then wait for delivery. When the job " +
      "board shows 'delivered', verify the delivery; release payment only if " +
      "verification passes, otherwise refund after the deadline. Record the " +
      "outcome in the reputation ledger either way.",
    options: {
      mcpServers: { "pactai-requester": server },
      canUseTool,
      tools: [],
    },
  })) {
    if (message.type === "assistant" || message.type === "result") console.log(message);
  }
}

main();
