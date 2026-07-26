"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import { formatEther, type Address } from "viem";
import { identityRegistryAbi, erc20Abi, reputationRegistryAbi } from "@/lib/abi";
import {
  ARC_CHAIN_ID,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  USDC_ADDRESS,
  addressUrl,
} from "@/lib/deployments";
import { EscrowState, formatUsdc, shortHash } from "@/lib/format";
import type { ClientJob } from "@/lib/client-types";
import { loadJobs, type LocalJob } from "@/lib/jobs";
import { JobList } from "./JobList";
import { CreateJobForm } from "./CreateJobForm";
import { RequesterJobCard } from "./RequesterJobCard";
import { ExecutorJobCard, type ExecutorAssignment } from "./ExecutorJobCard";
import { Panel, Stat } from "./ui";

export function Dashboard({ jobs, loadError }: { jobs: ClientJob[]; loadError?: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected || !address) return <ConnectPrompt />;

  if (chainId !== ARC_CHAIN_ID) {
    return (
      <Panel className="mt-8">
        <h2 className="text-lg font-bold text-amber">Wrong network</h2>
        <p className="mt-2 text-sm text-muted">
          PactAI lives on Arc Testnet (chain id {ARC_CHAIN_ID}). Your wallet is on chain{" "}
          {chainId ?? "unknown"}.
        </p>
        <button
          onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
          disabled={switching}
          className="mt-4 rounded-lg bg-accent px-4 py-2 font-semibold text-[#06101f] disabled:opacity-60"
        >
          {switching ? "Switching…" : "Switch to Arc Testnet"}
        </button>
        <p className="mt-3 text-xs text-muted">
          If your wallet does not know Arc yet it will offer to add it — RPC
          https://rpc.testnet.arc.network, gas token USDC.
        </p>
      </Panel>
    );
  }

  return <ConnectedDashboard address={address} jobs={jobs} loadError={loadError} />;
}

function ConnectPrompt() {
  return (
    <Panel className="mt-8">
      <h2 className="text-lg font-bold">Connect a wallet to continue</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Nothing here is custodial — the dashboard only reads your address and asks you to sign the
        calls you choose to make. You will need Arc Testnet USDC; the Circle faucet drips it.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <ConnectButton showBalance={false} />
        <a
          className="text-sm text-accent hover:underline"
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer"
        >
          Get testnet USDC →
        </a>
      </div>
    </Panel>
  );
}

function ConnectedDashboard({
  address,
  jobs,
  loadError,
}: {
  address: Address;
  jobs: ClientJob[];
  loadError?: string;
}) {
  // Arc's gas token is USDC itself (18-decimal native balance); the 6-decimal
  // ERC-20 at 0x3600… is a view of the same money, which is what the escrow
  // moves. They are never summed.
  const nativeBalance = useBalance({ address });

  const erc20Balance = useReadContract({
    abi: erc20Abi,
    address: USDC_ADDRESS,
    functionName: "balanceOf",
    args: [address],
  });

  const agentId = useReadContract({
    abi: identityRegistryAbi,
    address: IDENTITY_REGISTRY,
    functionName: "agentIdOf",
    args: [address],
  });

  const registeredId = agentId.data && agentId.data > 0n ? agentId.data : undefined;

  const summary = useReadContract({
    abi: reputationRegistryAbi,
    address: REPUTATION_REGISTRY,
    functionName: "getSummary",
    args: registeredId ? [registeredId] : undefined,
    query: { enabled: Boolean(registeredId) },
  });

  // Jobs this browser funded. They are tracked straight from the chain rather
  // than from the explorer snapshot, so a job you just funded is visible
  // immediately instead of after the next revalidation.
  const [localJobs, setLocalJobs] = useState<LocalJob[]>([]);
  useEffect(() => setLocalJobs(loadJobs()), []);
  const localIds = new Set(localJobs.map((j) => j.jobId.toLowerCase()));

  const mine = jobs.filter(
    (job) =>
      job.requester.toLowerCase() === address.toLowerCase() ||
      job.executor.toLowerCase() === address.toLowerCase(),
  );

  // Jobs someone funded naming this wallet as the executor. The explorer
  // snapshot is the general source; the local store is merged in so a job
  // funded seconds ago in this same browser is workable immediately, and
  // brings its terms with it.
  const assignments: ExecutorAssignment[] = [];
  const seenAssignments = new Set<string>();
  for (const job of localJobs) {
    if (job.executor.toLowerCase() !== address.toLowerCase()) continue;
    seenAssignments.add(job.jobId.toLowerCase());
    assignments.push({
      jobId: job.jobId,
      facility: job.facility,
      notAfter: job.notAfter,
      boardId: job.boardId,
    });
  }
  for (const job of jobs) {
    if (job.executor.toLowerCase() !== address.toLowerCase()) continue;
    if (seenAssignments.has(job.jobId.toLowerCase())) continue;
    seenAssignments.add(job.jobId.toLowerCase());
    assignments.push({ jobId: job.jobId });
  }

  // Totals cover every job this wallet touched; the read-only list below drops
  // the ones that already have a live card of their own further up the page.
  const otherJobs = mine.filter(
    (job) =>
      !localIds.has(job.jobId.toLowerCase()) && !seenAssignments.has(job.jobId.toLowerCase()),
  );

  const asRequester = mine.filter((j) => j.requester.toLowerCase() === address.toLowerCase());
  const asExecutor = mine.filter((j) => j.executor.toLowerCase() === address.toLowerCase());
  const earned = asExecutor
    .filter((j) => j.state === EscrowState.Released)
    .reduce((sum, j) => sum + BigInt(j.amount), 0n);
  const spent = asRequester
    .filter((j) => j.state === EscrowState.Released)
    .reduce((sum, j) => sum + BigInt(j.amount), 0n);

  const [totalJobs, released, releaseRate] = summary.data ?? [0n, 0n, 0];

  return (
    <div className="mt-8 space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={
            erc20Balance.data !== undefined ? `${formatUsdc(erc20Balance.data)} USDC` : "loading…"
          }
          label="Spendable USDC"
          hint="ERC-20 view — what the escrow pulls"
        />
        <Stat
          value={
            nativeBalance.data
              ? `${Number(formatEther(nativeBalance.data.value)).toFixed(4)} USDC`
              : "loading…"
          }
          label="Gas balance"
          hint="native, 18 decimals"
          tone="muted"
        />
        <Stat
          value={`${formatUsdc(earned)} USDC`}
          label="Earned through escrow"
          hint={`${asExecutor.length} job(s) as executor`}
          tone="mint"
        />
        <Stat
          value={`${formatUsdc(spent)} USDC`}
          label="Paid out as requester"
          hint={`${asRequester.length} job(s) funded`}
          tone="amber"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-bold">On-chain identity</h2>
          <p className="mt-1 font-mono text-xs text-muted">
            <a
              className="text-accent hover:underline"
              href={addressUrl(address)}
              target="_blank"
              rel="noreferrer"
            >
              {shortHash(address, 10, 8)}
            </a>
          </p>

          {agentId.isLoading ? (
            <p className="mt-4 text-sm text-muted">Checking the ERC-8004 registry…</p>
          ) : registeredId ? (
            <div className="mt-4">
              <div className="text-sm">
                Registered as agent{" "}
                <span className="font-mono text-mint">#{registeredId.toString()}</span> in PactAI&apos;s
                Identity Registry.
              </div>
              <p className="mt-2 text-xs text-muted">
                The registry entry is an ERC-721 token owned by this wallet, with the AgentCard
                stored as its token URI.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="text-sm text-muted">
                This wallet is not registered as an ERC-8004 agent.
              </div>
              <p className="mt-2 text-xs text-muted">
                Registration is not required to fund or take jobs — it is what makes an executor&apos;s
                completed jobs accumulate into a portable reputation record.
              </p>
            </div>
          )}
        </Panel>

        <Panel>
          <h2 className="text-lg font-bold">Reputation</h2>
          {registeredId && totalJobs > 0n ? (
            <>
              <div className="mt-4 flex flex-wrap gap-8">
                <div>
                  <div className="text-2xl font-extrabold text-accent">{totalJobs.toString()}</div>
                  <div className="text-xs text-muted">jobs recorded</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-mint">{released.toString()}</div>
                  <div className="text-xs text-muted">released</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-ink">{Number(releaseRate)}%</div>
                  <div className="text-xs text-muted">release rate</div>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted">
                Recorded permissionlessly from the escrow&apos;s own final state — nobody can write a
                score that the money did not already prove.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              No reputation record yet — outcomes accrue to the executor side of a job. It starts
              existing once this wallet delivers a job and someone calls{" "}
              <span className="font-mono text-xs">recordOutcome</span> on it.
            </p>
          )}
        </Panel>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Hire an executor</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Do by hand what the requester agent does on its own: lock the budget, watch for a
            delivery, check the proof, then pay or take the money back.
          </p>
        </div>

        <CreateJobForm onCreated={(job) => setLocalJobs((prev) => [job, ...prev])} />

        {localJobs.length > 0 ? (
          <div className="grid gap-3">
            {localJobs.map((job) => (
              <RequesterJobCard
                key={job.jobId}
                job={job}
                viewer={address}
                onForget={() => setLocalJobs(loadJobs())}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Work assigned to you</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The executor side: hunt the slot, race to claim it, and commit its hash to the escrow.
            Jobs appear here when someone funds one naming this wallet.
          </p>
        </div>

        {assignments.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted">
              Nobody has hired this wallet yet. To try both sides at once, post a job above with
              your own address as the executor — the escrow allows it, and it is the quickest way
              to see the full cycle.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-3">
            {assignments.map((assignment) => (
              <ExecutorJobCard key={assignment.jobId} assignment={assignment} viewer={address} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">Your jobs</h2>
        {loadError ? (
          <Panel className="mt-3">
            <p className="text-sm text-amber">
              Could not read job history from the explorer ({loadError}). Balances and identity
              above come straight from the chain and are unaffected.
            </p>
          </Panel>
        ) : otherJobs.length === 0 ? (
          <Panel className="mt-3">
            <p className="text-sm text-muted">
              {localJobs.length > 0
                ? "Nothing beyond the jobs you funded from this browser, above."
                : "This wallet has not taken part in any escrowed job yet."}
            </p>
          </Panel>
        ) : (
          <JobList jobs={otherJobs} viewer={address} className="mt-3" />
        )}
      </section>
    </div>
  );
}
