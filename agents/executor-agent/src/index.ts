/**
 * Executor agent — entry point.
 *
 * Polls the job board, quotes jobs it can do, does the work, and submits a
 * result. STUB: fill in the actual task logic (`performTask`) and the
 * circle-tools wiring for `submit_result` (JobEscrow.submitResult) following
 * the same pattern as agents/requester-agent/src/index.ts.
 *
 * Keep the MVP task narrow — see docs/PLAN.md cut list #4. Whatever single
 * task type this agent supports (e.g. "summarize a URL"), that's the whole
 * demo; don't build a general-purpose executor.
 */
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Job, Quote } from "@pactai/shared";

const JOB_BOARD_URL = process.env.JOB_BOARD_URL ?? "http://localhost:4000";
const QUOTE_PRICE_USDC = Number(process.env.QUOTE_PRICE_USDC ?? 1);

const listOpenJobs = tool(
  "list_open_jobs",
  "List jobs on the job board that are still open for quotes.",
  {},
  async () => {
    const res = await fetch(`${JOB_BOARD_URL}/jobs?state=open`);
    const jobs: Job[] = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(jobs) }] };
  },
);

const submitQuote = tool(
  "submit_quote",
  "Submit a price quote for a job this agent can complete.",
  {},
  async (args: { jobId: string; etaSeconds: number }) => {
    const quote: Quote = {
      jobId: args.jobId,
      executorId: process.env.EXECUTOR_WALLET_ADDRESS ?? "unknown",
      priceUsdc: QUOTE_PRICE_USDC,
      etaSeconds: args.etaSeconds,
      createdAt: Date.now(),
    };
    const res = await fetch(`${JOB_BOARD_URL}/jobs/${args.jobId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quote),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json()) }] };
  },
);

// TODO: implement the one task type this executor supports for the demo.
async function performTask(spec: string): Promise<{ uri: string; hash: string }> {
  throw new Error(`TODO: implement performTask for spec: ${spec}`);
}

const deliverResult = tool(
  "deliver_result",
  "Perform the job's task and submit the result + hash to the job board and JobEscrow.submitResult.",
  {},
  async (args: { jobId: string; spec: string }) => {
    const { uri, hash } = await performTask(args.spec);
    await fetch(`${JOB_BOARD_URL}/jobs/${args.jobId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: args.jobId,
        executorId: process.env.EXECUTOR_WALLET_ADDRESS ?? "unknown",
        resultUri: uri,
        resultHash: hash,
        submittedAt: Date.now(),
      }),
    });
    // TODO(spend? no — this is a state-changing but non-spend tx): call
    // JobEscrow.submitResult(jobId, resultHash) via circle-tools / viem.
    return { content: [{ type: "text", text: `delivered ${args.jobId}` }] };
  },
);

const circleTools = createSdkMcpServer({
  name: "pactai-executor",
  tools: [listOpenJobs, submitQuote, deliverResult],
});

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required — see .env.example");
    process.exit(1);
  }

  for await (const message of query({
    prompt:
      "You are the executor agent in PactAI. Poll for open jobs, quote the " +
      "ones you can complete, and once a quote is accepted (job state " +
      "'funded'), perform the task and deliver the result.",
    options: {
      mcpServers: { "pactai-executor": circleTools },
      tools: [],
    },
  })) {
    console.log(message);
  }
}

main();
