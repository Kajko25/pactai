/**
 * Requester agent — entry point.
 *
 * Mirrors the shape of Circle's official `claude-agent-sdk` starter kit
 * (agent wallet + circle-tools exposed as an in-process MCP server), but
 * adds PactAI-specific tools for posting jobs, scoring quotes, and driving
 * the JobEscrow contract instead of a one-shot x402 payment.
 *
 * STUB: this file lays out the tool loop and TODOs. Fill in the Circle
 * wallet/x402 calls by following the pattern in
 * https://github.com/circlefin/agent-stack-starter-kits/tree/master/kits/claude-agent-sdk
 * (packages/circle-tools) once the job-board and JobEscrow are running.
 */
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { scoreQuote, type Job, type Quote } from "@pactai/shared";

const JOB_BOARD_URL = process.env.JOB_BOARD_URL ?? "http://localhost:4000";
const BUDGET_CAP_USDC = Number(process.env.BUDGET_CAP_USDC ?? 5);

// --- Tools -----------------------------------------------------------------
// TODO: replace fetch stubs below with real job-board calls once
// services/job-board is running, and wire circle-tools for wallet/escrow
// calls (fund/release) exactly as circle_pay_service is wired in the
// reference kit — same execFileSync-to-circle-cli pattern.

const postJob = tool(
  "post_job",
  "Post a new job to the PactAI job board with a spec, budget cap, and deadline.",
  {},
  async (args: { spec: string; budgetUsdc: number; deadlineSeconds: number }) => {
    const job: Job = {
      id: crypto.randomUUID(),
      requesterId: process.env.REQUESTER_WALLET_ADDRESS ?? "unknown",
      spec: args.spec,
      budgetUsdc: Math.min(args.budgetUsdc, BUDGET_CAP_USDC),
      deadline: Math.floor(Date.now() / 1000) + args.deadlineSeconds,
      state: "open",
      createdAt: Date.now(),
    };
    const res = await fetch(`${JOB_BOARD_URL}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json()) }] };
  },
);

const listQuotes = tool(
  "list_quotes",
  "List quotes submitted by executor agents for a given job.",
  {},
  async (args: { jobId: string }) => {
    const res = await fetch(`${JOB_BOARD_URL}/jobs/${args.jobId}/quotes`);
    const quotes: Quote[] = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(quotes) }] };
  },
);

// TODO(spend): implement using circle-tools, gated behind canUseTool below,
// exactly like circle_pay_service / circle_gateway_deposit in the reference
// kit. This calls JobEscrow.fund(jobId, executor, amount, deadline).
const fundEscrow = tool(
  "fund_escrow",
  "Fund the JobEscrow contract for a selected quote, moving USDC from this agent's wallet into escrow.",
  {},
  async (args: { jobId: string; executorId: string; amountUsdc: number; deadline: number }) => {
    throw new Error("TODO: wire JOB_ESCROW_ADDRESS.fund() via circle-tools / viem");
  },
);

// TODO(spend): implement using circle-tools, gated behind canUseTool below.
// Calls JobEscrow.release(jobId) once the delivered result passes verification.
const releaseEscrow = tool(
  "release_escrow",
  "Release escrowed USDC to the executor after verifying the delivered result.",
  {},
  async (args: { jobId: string }) => {
    throw new Error("TODO: wire JOB_ESCROW_ADDRESS.release() via circle-tools / viem");
  },
);

const circleTools = createSdkMcpServer({
  name: "pactai-requester",
  tools: [postJob, listQuotes, fundEscrow, releaseEscrow],
});

// --- Human-in-the-loop spend gate -------------------------------------------
// Same pattern as the reference kit: only spend-side tools pause for
// approval. Everything else runs autonomously.
const SPEND_TOOLS = new Set(["mcp__pactai-requester__fund_escrow", "mcp__pactai-requester__release_escrow"]);

async function canUseTool(toolName: string, input: unknown) {
  if (!SPEND_TOOLS.has(toolName)) return { behavior: "allow" as const, updatedInput: input };
  console.log(`[approval needed] ${toolName}`, input);
  // TODO: replace with a real y/N terminal prompt (see reference kit) before
  // moving beyond the demo stage.
  return { behavior: "allow" as const, updatedInput: input };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required — see .env.example");
    process.exit(1);
  }

  console.log("[requester-agent] starting — scoreQuote helper available:", typeof scoreQuote);

  for await (const message of query({
    prompt:
      "You are the requester agent in PactAI. Post one job, wait for quotes, " +
      "pick the best one using price + reputation, fund escrow, and after " +
      "the executor delivers, verify and release payment.",
    options: {
      mcpServers: { "pactai-requester": circleTools },
      canUseTool,
      tools: [],
    },
  })) {
    console.log(message);
  }
}

main();
