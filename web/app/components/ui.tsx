import { addressUrl, agentLabel, txUrl } from "@/lib/deployments";
import { EscrowState, ESCROW_STATE_LABEL, shortHash } from "@/lib/format";

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-hairline bg-panel p-5 ${className}`}>{children}</div>
  );
}

export function Stat({
  value,
  label,
  hint,
  tone = "accent",
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "accent" | "mint" | "amber" | "muted";
}) {
  const toneClass = {
    accent: "text-accent",
    mint: "text-mint",
    amber: "text-amber",
    muted: "text-muted",
  }[tone];

  return (
    <Panel className="lift">
      <div className={`text-2xl font-extrabold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-sm text-ink">{label}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </Panel>
  );
}

const STATE_STYLE: Record<EscrowState, string> = {
  [EscrowState.None]: "border-hairline text-muted",
  [EscrowState.Funded]: "border-amber/60 text-amber",
  [EscrowState.Delivered]: "border-accent/60 text-accent",
  [EscrowState.Released]: "border-mint/60 text-mint",
  [EscrowState.Refunded]: "border-danger/60 text-danger",
};

export function StateBadge({ state }: { state: EscrowState }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs ${STATE_STYLE[state]}`}
    >
      {ESCROW_STATE_LABEL[state]}
    </span>
  );
}

export function AddressLink({ address, showLabel = true }: { address: string; showLabel?: boolean }) {
  const label = showLabel ? agentLabel(address) : undefined;
  return (
    <a
      href={addressUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-accent hover:underline"
      title={address}
    >
      {label ? `${label} (${shortHash(address, 6, 4)})` : shortHash(address, 6, 4)}
    </a>
  );
}

export function TxLink({ hash, children }: { hash: string; children?: React.ReactNode }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-accent hover:underline"
      title={hash}
    >
      {children ?? shortHash(hash, 10, 6)}
    </a>
  );
}
