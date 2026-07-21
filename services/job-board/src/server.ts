import { Hono } from "hono";
import {
  JobSchema,
  QuoteSchema,
  ResultSchema,
  ReputationEntrySchema,
  JobStateSchema,
  type Job,
  type Quote,
  type JobResult,
  type ReputationEntry,
} from "@pactai/shared";

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
  const parsed = JobSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const job = parsed.data;
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

  const parsed = QuoteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const quote = parsed.data;
  quotes.get(jobId)!.push(quote);
  if (job.state === "open") job.state = "quoted";
  return c.json(quote, 201);
});

app.get("/jobs/:id/quotes", (c) => {
  return c.json(quotes.get(c.req.param("id")) ?? []);
});

app.post("/jobs/:id/state", async (c) => {
  const jobId = c.req.param("id");
  const job = jobs.get(jobId);
  if (!job) return c.json({ error: "not found" }, 404);
  const parsed = JobStateSchema.safeParse((await c.req.json<{ state: string }>()).state);
  if (!parsed.success) return c.json({ error: "invalid state" }, 400);
  job.state = parsed.data;
  return c.json(job);
});

app.post("/jobs/:id/result", async (c) => {
  const jobId = c.req.param("id");
  const parsed = ResultSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = parsed.data;
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
  const parsed = ReputationEntrySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  reputation.push(parsed.data);
  return c.json(parsed.data, 201);
});

app.get("/reputation", (c) => c.json(reputation));

app.get("/reputation/:executorId", (c) => {
  const executorId = c.req.param("executorId");
  return c.json(reputation.filter((r) => r.executorId === executorId));
});

const port = Number(process.env.PORT ?? 4000);
console.log(`[job-board] listening on :${port}`);
export default { port, fetch: app.fetch };
