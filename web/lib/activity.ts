// Reading PactAI's history off Arc.
//
// Arc's RPC caps eth_getLogs at a 10,000-block window and rate-limits hard,
// and JobEscrow has been live for ~800k blocks — a chunked walk would be ~80
// requests per page load. The explorer (Blockscout) already indexes every log,
// so history comes from its API and only per-job current state is read from
// the chain. Decoding is done here with our own ABIs rather than trusting the
// explorer's `decoded` field, which is empty for contracts whose source has
// not been verified.
import { decodeEventLog, type Address, type Hex } from "viem";
import { EXPLORER_URL, IDENTITY_REGISTRY, JOB_ESCROW, REPUTATION_REGISTRY } from "./deployments";
import { identityRegistryAbi, jobEscrowAbi, reputationRegistryAbi } from "./abi";
import { EscrowState } from "./format";

const MAX_PAGES = 10;

type BlockscoutLog = {
  address: { hash: string };
  topics: (string | null)[];
  data: Hex;
  block_number: number;
  block_timestamp: string;
  transaction_hash: Hex;
  index: number;
};

export type ChainLog = {
  topics: [Hex, ...Hex[]];
  data: Hex;
  blockNumber: number;
  timestamp: string;
  txHash: Hex;
  logIndex: number;
};

async function fetchAddressLogs(address: Address): Promise<ChainLog[]> {
  const out: ChainLog[] = [];
  let query = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${EXPLORER_URL}/api/v2/addresses/${address}/logs${query}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`explorer ${res.status} for ${address}`);
    const body = (await res.json()) as {
      items: BlockscoutLog[];
      next_page_params: Record<string, string | number> | null;
    };

    for (const item of body.items) {
      const topics = item.topics.filter((t): t is Hex => Boolean(t));
      if (topics.length === 0) continue;
      out.push({
        topics: topics as [Hex, ...Hex[]],
        data: item.data,
        blockNumber: item.block_number,
        timestamp: item.block_timestamp,
        txHash: item.transaction_hash,
        logIndex: item.index,
      });
    }

    if (!body.next_page_params) break;
    query = `?${new URLSearchParams(
      Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)]),
    )}`;
  }

  // Explorer returns newest-first; the aggregations below assume chronology.
  return out.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber - b.blockNumber,
  );
}

export type EscrowEventName = "JobFunded" | "ResultSubmitted" | "JobReleased" | "JobRefunded";

export type EscrowEvent = {
  name: EscrowEventName;
  jobId: Hex;
  txHash: Hex;
  blockNumber: number;
  timestamp: string;
  requester?: Address;
  executor?: Address;
  amount?: bigint;
  deadline?: number;
  resultHash?: Hex;
};

export type JobRow = {
  jobId: Hex;
  requester: Address;
  executor: Address;
  amount: bigint;
  deadline: number;
  state: EscrowState;
  resultHash?: Hex;
  fundedAt: string;
  settledAt?: string;
  events: EscrowEvent[];
  /** Outcome mirrored into the ERC-8004 reputation registry, if recorded. */
  reputationOutcome?: number;
};

export type AgentRow = {
  agentId: number;
  wallet: Address;
  name?: string;
  description?: string;
  role?: string;
  registeredAt: string;
  registerTx: Hex;
  totalJobs: number;
  released: number;
  releaseRate: number;
};

export type ActivitySnapshot = {
  jobs: JobRow[];
  agents: AgentRow[];
  totals: {
    jobs: number;
    released: number;
    refunded: number;
    inFlight: number;
    usdcSettled: bigint;
  };
  /** Set when the explorer API was unreachable, so the UI can say so. */
  error?: string;
};

function decodeEscrowEvents(logs: ChainLog[]): EscrowEvent[] {
  const events: EscrowEvent[] = [];
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: jobEscrowAbi, topics: log.topics, data: log.data });
    } catch {
      continue; // event from an ABI we don't model — ignore rather than fail the page
    }
    const args = decoded.args as Record<string, unknown>;
    events.push({
      name: decoded.eventName as EscrowEventName,
      jobId: args.jobId as Hex,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      timestamp: log.timestamp,
      requester: args.requester as Address | undefined,
      executor: args.executor as Address | undefined,
      amount: args.amount as bigint | undefined,
      deadline: args.deadline !== undefined ? Number(args.deadline) : undefined,
      resultHash: args.resultHash as Hex | undefined,
    });
  }
  return events;
}

function groupJobs(events: EscrowEvent[]): JobRow[] {
  const byJob = new Map<Hex, JobRow>();

  for (const event of events) {
    let job = byJob.get(event.jobId);
    if (!job) {
      if (event.name !== "JobFunded") continue; // orphan event, no funding in range
      job = {
        jobId: event.jobId,
        requester: event.requester as Address,
        executor: event.executor as Address,
        amount: event.amount ?? 0n,
        deadline: event.deadline ?? 0,
        state: EscrowState.Funded,
        fundedAt: event.timestamp,
        events: [],
      };
      byJob.set(event.jobId, job);
    }
    job.events.push(event);

    switch (event.name) {
      case "ResultSubmitted":
        job.state = EscrowState.Delivered;
        job.resultHash = event.resultHash;
        break;
      case "JobReleased":
        job.state = EscrowState.Released;
        job.settledAt = event.timestamp;
        break;
      case "JobRefunded":
        job.state = EscrowState.Refunded;
        job.settledAt = event.timestamp;
        break;
      default:
        break;
    }
  }

  return [...byJob.values()].sort(
    (a, b) => new Date(b.fundedAt).getTime() - new Date(a.fundedAt).getTime(),
  );
}

type AgentCard = { name?: string; description?: string; role?: string };

function parseAgentCard(uri: string): AgentCard {
  if (!uri.startsWith("data:")) return {};
  const [, payload] = uri.split(",");
  if (!payload) return {};
  try {
    const json = uri.includes(";base64,")
      ? Buffer.from(payload, "base64").toString("utf8")
      : decodeURIComponent(payload);
    return JSON.parse(json) as AgentCard;
  } catch {
    return {};
  }
}

async function loadAgents(logs: ChainLog[]): Promise<AgentRow[]> {
  const agents: AgentRow[] = [];

  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: identityRegistryAbi, topics: log.topics, data: log.data });
    } catch {
      continue; // ERC-721 Transfer / MetadataUpdate noise
    }
    if (decoded.eventName !== "Registered") continue;
    const args = decoded.args as unknown as { agentId: bigint; agentURI: string; owner: Address };
    const card = parseAgentCard(args.agentURI);
    agents.push({
      agentId: Number(args.agentId),
      wallet: args.owner,
      name: card.name,
      description: card.description,
      role: card.role,
      registeredAt: log.timestamp,
      registerTx: log.txHash,
      totalJobs: 0,
      released: 0,
      releaseRate: 0,
    });
  }

  return agents.sort((a, b) => a.agentId - b.agentId);
}

function applyReputation(logs: ChainLog[], agents: AgentRow[], jobs: JobRow[]): void {
  const byAgent = new Map(agents.map((a) => [a.agentId, a]));
  const byJob = new Map(jobs.map((j) => [j.jobId.toLowerCase(), j]));

  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: reputationRegistryAbi, topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (decoded.eventName !== "OutcomeRecorded") continue;
    const args = decoded.args as unknown as { jobId: Hex; agentId: bigint; outcome: number };

    const agent = byAgent.get(Number(args.agentId));
    if (agent) {
      agent.totalJobs += 1;
      if (args.outcome === 1) agent.released += 1;
      agent.releaseRate = Math.floor((agent.released * 100) / agent.totalJobs);
    }

    const job = byJob.get(args.jobId.toLowerCase());
    if (job) job.reputationOutcome = args.outcome;
  }
}

/** Everything the Activity page renders, in one server-side read. */
export async function loadActivity(): Promise<ActivitySnapshot> {
  const empty: ActivitySnapshot = {
    jobs: [],
    agents: [],
    totals: { jobs: 0, released: 0, refunded: 0, inFlight: 0, usdcSettled: 0n },
  };

  try {
    const [escrowLogs, identityLogs, reputationLogs] = await Promise.all([
      fetchAddressLogs(JOB_ESCROW),
      fetchAddressLogs(IDENTITY_REGISTRY),
      fetchAddressLogs(REPUTATION_REGISTRY),
    ]);

    const jobs = groupJobs(decodeEscrowEvents(escrowLogs));
    const agents = await loadAgents(identityLogs);
    applyReputation(reputationLogs, agents, jobs);

    const released = jobs.filter((j) => j.state === EscrowState.Released);
    const refunded = jobs.filter((j) => j.state === EscrowState.Refunded);

    return {
      jobs,
      agents,
      totals: {
        jobs: jobs.length,
        released: released.length,
        refunded: refunded.length,
        inFlight: jobs.length - released.length - refunded.length,
        usdcSettled: released.reduce((sum, j) => sum + j.amount, 0n),
      },
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) };
  }
}
