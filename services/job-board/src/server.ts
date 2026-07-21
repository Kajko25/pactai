import { Hono } from "hono";
import type { Job, Quote, JobResult, ReputationEntry } from "@pactai/shared";

/**
 * Minimal in-memory job board. Both agents hit this over HTTP.
 * Swap the Maps for SQLite/Postgres once this needs to survive a restart —
 * fine for a hackathon demo as-is (see docs/PLAN.md).
 */
const jobs = new Map<string, Job>();
const quotes = new Map<string, Quote[]>(); // jobId -> quotes
const results = new Map<string, JobResult>(); // jobId -> result
const reputation: ReputationEntry[] = [];

const app = new Hono();

app.post("/jobs", async (c) => {
  const job = await c.req.json<Job>();
  jobs.set(job.id, job);
  quotes.set(job.id, []);
  return c.json(job, 201);
});

app.get("/jobs", (c) => {
  const state = c.req.query("state");
  const all = [...jobs.values()];
  return c.json(state ? all.filter((j) => j.state === state) : all);
});

app.get("/jobs/:id", (c) => {
  const job = jobs.get(c.req.param("id"));
  if (!job) return c.json({ error: "not found" }, 404);
  return c.json(job);
});

app.post("/jobs/:id/quotes", async (c) => {
  const jobId = c.req.param("id");
  const job = jobs.get(jobId);
  if (!job) return c.json({ error: "not found" }, 404);

  const quote = await c.req.json<Quote>();
  quotes.get(jobId)!.push(quote);
  job.state = "quoted";
  return c.json(quote, 201);
});

app.get("/jobs/:id/quotes", (c) => {
  return c.json(quotes.get(c.req.param("id")) ?? []);
});

app.post("/jobs/:id/state", async (c) => {
  const jobId = c.req.param("id");
  const job = jobs.get(jobId);
  if (!job) return c.json({ error: "not found" }, 404);
  const { state } = await c.req.json<{ state: Job["state"] }>();
  job.state = state;
  return c.json(job);
});

app.post("/jobs/:id/result", async (c) => {
  const jobId = c.req.param("id");
  const result = await c.req.json<JobResult>();
  results.set(jobId, result);
  const job = jobs.get(jobId);
  if (job) job.state = "delivered";
  return c.json(result, 201);
});

app.get("/jobs/:id/result", (c) => {
  const result = results.get(c.req.param("id"));
  if (!result) return c.json({ error: "not found" }, 404);
  return c.json(result);
});

app.post("/reputation", async (c) => {
  const entry = await c.req.json<ReputationEntry>();
  reputation.push(entry);
  return c.json(entry, 201);
});

app.get("/reputation/:executorId", (c) => {
  const executorId = c.req.param("executorId");
  return c.json(reputation.filter((r) => r.executorId === executorId));
});

const port = Number(process.env.PORT ?? 4000);
console.log(`[job-board] listening on :${port}`);
export default { port, fetch: app.fetch };
