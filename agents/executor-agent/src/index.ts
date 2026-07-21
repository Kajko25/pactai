/**
 * Executor agent (the slot hunter) — Claude Agent SDK entry point.
 *
 * Polls the job board for slot-hunt jobs, quotes the ones it can do, and
 * once funded, hunts the slot source until a matching slot appears, claims
 * it, and delivers proof (job board + on-chain submitResult).
 *
 * All protocol logic lives in lib.ts; this file is only the LLM wiring.
 * A hunt that times out is a legitimate outcome — the requester's escrow
 * refunds after the deadline and this hunter's reputation takes the hit.
 */
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { makeEscrowClient, parseSlotTask } from "@pactai/shared";
import { makeExecutor } from "./lib";
import type { Address, Hex } from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required — see .env.example`);
    process.exit(1);
  }
  return value;
}

const executor = makeExecutor({
  jobBoardUrl: process.env.JOB_BOARD_URL ?? "http://localhost:4000",
  slotSourceUrl: process.env.SLOT_SOURCE_URL ?? "http://localhost:4100",
  quotePriceUsdc: Number(process.env.QUOTE_PRICE_USDC ?? 1),
  escrow: makeEscrowClient({
    rpcUrl: requireEnv("RPC_URL"),
    chainId: Number(requireEnv("CHAIN_ID")),
    privateKey: requireEnv("EXECUTOR_PRIVATE_KEY") as Hex,
    escrowAddress: requireEnv("JOB_ESCROW_ADDRESS") as Address,
    usdcAddress: requireEnv("USDC_ADDRESS") as Address,
  }),
});

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

const listOpenJobs = tool(
  "list_open_jobs",
  "List jobs on the job board that are still open for quotes.",
  {},
  async () => text(await executor.listOpenJobs()),
);

const submitQuote = tool(
  "submit_quote",
  "Submit a price quote for a slot-hunt job this hunter can work on.",
  { jobId: z.string(), etaSeconds: z.number().positive() },
  async (args) => {
    const jobs = await executor.listOpenJobs();
    const job = jobs.find((j) => j.id === args.jobId);
    if (!job) return text({ error: "job not open" });
    return text(await executor.quoteJob(job, args.etaSeconds));
  },
);

const checkFunded = tool(
  "check_funded",
  "Check whether a quoted job has been funded by the requester (escrow live).",
  { jobId: z.string() },
  async (args) => {
    const res = await fetch(`${process.env.JOB_BOARD_URL ?? "http://localhost:4000"}/jobs/${args.jobId}`);
    return text(await res.json());
  },
);

const workJob = tool(
  "work_job",
  "Hunt the slot for a funded job: poll the slot source until a matching slot appears, claim it, and deliver proof (job board + on-chain submitResult). Returns null if the hunt times out before the job deadline.",
  {
    jobId: z.string(),
    pollIntervalMs: z.number().positive().default(2000),
  },
  async (args) => {
    const res = await fetch(`${process.env.JOB_BOARD_URL ?? "http://localhost:4000"}/jobs/${args.jobId}`);
    if (!res.ok) return text({ error: "unknown job" });
    const job = await res.json();
    const task = parseSlotTask(job.spec);
    const outcome = await executor.workJob(job, {
      pollIntervalMs: args.pollIntervalMs,
      giveUpAtMs: job.deadline * 1000,
    });
    return text(outcome ?? { timedOut: true, task });
  },
);

const server = createSdkMcpServer({
  name: "pactai-executor",
  tools: [listOpenJobs, submitQuote, checkFunded, workJob],
});

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required — see .env.example");
    process.exit(1);
  }
  console.log(`[executor-agent] hunter wallet ${executor.address}`);

  for await (const message of query({
    prompt:
      "You are the executor agent in PactAI (SlotScout) — a slot hunter. " +
      "Poll for open slot-hunt jobs, quote the ones you can work with a " +
      "realistic ETA, wait until a quote is accepted (job state 'funded'), " +
      "then work the job: hunt the slot, claim it, deliver proof. If the " +
      "hunt times out, report that honestly — the escrow will refund the " +
      "requester and your reputation takes the hit.",
    options: {
      mcpServers: { "pactai-executor": server },
      tools: [],
    },
  })) {
    if (message.type === "assistant" || message.type === "result") console.log(message);
  }
}

main();
