import { loadActivity } from "@/lib/activity";
import { toClientJobs } from "@/lib/client-types";
import { formatUsdc } from "@/lib/format";
import {
  IDENTITY_REGISTRY,
  JOB_ESCROW,
  REPUTATION_REGISTRY,
  addressUrl,
} from "@/lib/deployments";
import { JobList } from "../components/JobList";
import { AddressLink, Panel, Stat, TxLink } from "../components/ui";

export const revalidate = 30;

const CONTRACTS = [
  { name: "JobEscrow", address: JOB_ESCROW, role: "holds the USDC, settles the job" },
  { name: "IdentityRegistry", address: IDENTITY_REGISTRY, role: "ERC-8004 agent identities" },
  {
    name: "JobReputationRegistry",
    address: REPUTATION_REGISTRY,
    role: "records outcomes from the escrow's final state",
  },
];

export default async function ActivityPage() {
  const activity = await loadActivity();

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-extrabold">Activity</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Every job PactAI has ever escrowed on Arc Testnet, read from the chain — no wallet needed,
        nothing here is typed in by hand.
      </p>

      {activity.error ? (
        <Panel className="mt-8">
          <h2 className="text-lg font-bold text-amber">Could not reach the explorer</h2>
          <p className="mt-2 text-sm text-muted">
            {activity.error}. History is indexed by Arcscan; the chain itself is fine. Try again in
            a moment, or read the contracts directly:
          </p>
          <ul className="mt-3 grid gap-1">
            {CONTRACTS.map((c) => (
              <li key={c.address} className="text-sm">
                <a
                  className="font-mono text-xs text-accent hover:underline"
                  href={addressUrl(c.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.name} · {c.address}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat value={activity.totals.jobs} label="Jobs escrowed" />
            <Stat value={activity.totals.released} label="Released" tone="mint" />
            <Stat value={activity.totals.refunded} label="Refunded" tone="amber" />
            <Stat
              value={`${formatUsdc(activity.totals.usdcSettled)} USDC`}
              label="Paid to executors"
              hint={
                activity.totals.inFlight > 0
                  ? `${activity.totals.inFlight} job(s) still in flight`
                  : "no jobs in flight"
              }
            />
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-bold">Registered agents</h2>
            <p className="mt-1 text-sm text-muted">
              ERC-8004 identities, with the reputation each one earned through completed jobs.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {activity.agents.map((agent) => (
                <Panel key={agent.agentId}>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-mint">#{agent.agentId}</span>
                    <h3 className="font-bold">{agent.name ?? "Unnamed agent"}</h3>
                    {agent.role ? (
                      <span className="rounded-md border border-hairline px-2 py-0.5 text-xs text-muted">
                        {agent.role}
                      </span>
                    ) : null}
                  </div>
                  {agent.description ? (
                    <p className="mt-2 text-sm text-muted">{agent.description}</p>
                  ) : null}
                  {/* Outcomes are recorded against the executor of a job, so a
                      requester-only agent legitimately has an empty record —
                      showing it as 0% would read like a bad score. */}
                  {agent.totalJobs > 0 ? (
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                      <span>
                        <span className="font-mono text-accent">{agent.totalJobs}</span>{" "}
                        <span className="text-xs text-muted">recorded</span>
                      </span>
                      <span>
                        <span className="font-mono text-mint">{agent.released}</span>{" "}
                        <span className="text-xs text-muted">released</span>
                      </span>
                      <span>
                        <span className="font-mono">{agent.releaseRate}%</span>{" "}
                        <span className="text-xs text-muted">release rate</span>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted">
                      No outcomes recorded — reputation accrues to the executor side of a job.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    <AddressLink address={agent.wallet} showLabel={false} />
                    <TxLink hash={agent.registerTx}>registration tx</TxLink>
                  </div>
                </Panel>
              ))}
              {activity.agents.length === 0 ? (
                <Panel>
                  <p className="text-sm text-muted">No agents registered yet.</p>
                </Panel>
              ) : null}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-bold">Jobs</h2>
            <p className="mt-1 text-sm text-muted">
              Newest first. Open one to see its full on-chain timeline and the proof it settled
              against.
            </p>
            {activity.jobs.length === 0 ? (
              <Panel className="mt-4">
                <p className="text-sm text-muted">No jobs escrowed yet.</p>
              </Panel>
            ) : (
              <JobList jobs={toClientJobs(activity.jobs)} className="mt-4" />
            )}
          </section>
        </>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-bold">Contracts</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {CONTRACTS.map((c) => (
            <Panel key={c.address}>
              <h3 className="font-bold">{c.name}</h3>
              <p className="mt-1 text-xs text-muted">{c.role}</p>
              <a
                className="mt-3 block break-all font-mono text-xs text-accent hover:underline"
                href={addressUrl(c.address)}
                target="_blank"
                rel="noreferrer"
              >
                {c.address}
              </a>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
