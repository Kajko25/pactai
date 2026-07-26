"use client";

import { useState } from "react";
import type { ClientJob } from "@/lib/client-types";
import {
  EscrowState,
  OUTCOME_LABEL,
  formatTimestamp,
  formatUsdc,
  relativeTime,
  shortHash,
} from "@/lib/format";
import { AddressLink, StateBadge, TxLink } from "./ui";

const EVENT_TONE: Record<string, string> = {
  JobFunded: "text-amber",
  ResultSubmitted: "text-accent",
  JobReleased: "text-mint",
  JobRefunded: "text-danger",
};

const EVENT_PLAIN: Record<string, string> = {
  JobFunded: "budget locked in escrow",
  ResultSubmitted: "executor submitted proof of the result",
  JobReleased: "proof accepted — executor paid",
  JobRefunded: "deadline passed or cancelled — requester refunded",
};

export function JobList({
  jobs,
  viewer,
  className = "",
}: {
  jobs: ClientJob[];
  viewer?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {jobs.map((job) => (
        <JobCard key={job.jobId} job={job} viewer={viewer} />
      ))}
    </div>
  );
}

function JobCard({ job, viewer }: { job: ClientJob; viewer?: string }) {
  const [open, setOpen] = useState(false);

  const role = viewer
    ? job.requester.toLowerCase() === viewer.toLowerCase()
      ? "you are the requester"
      : "you are the executor"
    : undefined;

  const deadlinePassed = job.deadline * 1000 < Date.now();
  const pending = job.state === EscrowState.Funded || job.state === EscrowState.Delivered;

  return (
    <div className="rounded-xl border border-hairline bg-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left"
      >
        <StateBadge state={job.state as EscrowState} />
        <span className="font-mono text-sm text-ink">{formatUsdc(BigInt(job.amount))} USDC</span>
        <span className="font-mono text-xs text-muted" title={job.jobId}>
          job {shortHash(job.jobId, 8, 6)}
        </span>
        {role ? (
          <span className="rounded-md border border-hairline px-2 py-0.5 text-xs text-muted">
            {role}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          funded {relativeTime(job.fundedAt)}
          <span className="ml-3 text-accent">{open ? "hide" : "details"}</span>
        </span>
      </button>

      {open ? (
        <div className="border-t border-hairline px-5 py-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Requester">
              <AddressLink address={job.requester} />
            </Field>
            <Field label="Executor">
              <AddressLink address={job.executor} />
            </Field>
            <Field label="Deadline">
              <span className={`font-mono text-xs ${pending && deadlinePassed ? "text-danger" : "text-muted"}`}>
                {formatTimestamp(job.deadline)}
                {pending && deadlinePassed ? " — refundable by anyone" : ""}
              </span>
            </Field>
            <Field label="Reputation record">
              <span className="font-mono text-xs text-muted">
                {job.reputationOutcome
                  ? `${OUTCOME_LABEL[job.reputationOutcome]} (ERC-8004)`
                  : "not recorded"}
              </span>
            </Field>
            {job.resultHash ? (
              <Field label="Result hash" wide>
                <span className="font-mono text-xs break-all text-muted">{job.resultHash}</span>
                <p className="mt-1 text-xs text-muted">
                  keccak256 of the canonical claim JSON. The requester re-fetches the claim from the
                  source and re-hashes it — a match is what release is paid against.
                </p>
              </Field>
            ) : null}
          </dl>

          <h4 className="mt-5 text-xs uppercase tracking-widest text-muted">Timeline</h4>
          <ol className="mt-2 grid gap-2">
            {job.events.map((event) => (
              <li key={`${event.txHash}-${event.name}`} className="flex flex-wrap items-baseline gap-x-3">
                <span className={`font-mono text-xs ${EVENT_TONE[event.name] ?? "text-muted"}`}>
                  {event.name}
                </span>
                <span className="text-xs text-muted">{EVENT_PLAIN[event.name]}</span>
                <span className="ml-auto flex items-baseline gap-3">
                  <span className="font-mono text-xs text-muted">block {event.blockNumber}</span>
                  <TxLink hash={event.txHash} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
