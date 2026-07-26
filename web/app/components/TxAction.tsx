"use client";

import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt } from "wagmi";
import type { Hex } from "viem";
import { TxLink } from "./ui";

type Tone = "primary" | "mint" | "danger" | "ghost";

const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-accent text-[#06101f] hover:opacity-90",
  mint: "bg-mint text-[#06180f] hover:opacity-90",
  danger: "border border-danger/60 text-danger hover:bg-danger/10",
  ghost: "border border-hairline text-ink hover:border-accent",
};

/**
 * One on-chain action: send it, wait for the receipt, and say plainly which of
 * those two stages it is in. Wallets confirm a transaction long before Arc
 * mines it, and a button that flips straight back to "done" invites the user
 * to click Release twice.
 */
export function TxAction({
  label,
  pendingLabel,
  tone = "primary",
  disabled,
  hint,
  send,
  onConfirmed,
}: {
  label: string;
  pendingLabel?: string;
  tone?: Tone;
  disabled?: boolean;
  hint?: string;
  send: () => Promise<Hex>;
  onConfirmed?: (hash: Hex) => void;
}) {
  const [hash, setHash] = useState<Hex>();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string>();

  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess && hash) onConfirmed?.(hash);
    // onConfirmed is a fresh closure each render; the hash guard is what makes
    // this fire once per transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess, hash]);

  const busy = signing || receipt.isLoading;

  async function run() {
    setError(undefined);
    setSigning(true);
    try {
      setHash(await send());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSigning(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={disabled || busy}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASS[tone]}`}
      >
        {signing
          ? "Confirm in your wallet…"
          : receipt.isLoading
            ? (pendingLabel ?? "Waiting for Arc…")
            : label}
      </button>

      {hint && !busy && !error ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}

      {hash ? (
        <p className="mt-1 text-xs text-muted">
          {receipt.isSuccess ? "confirmed" : "submitted"} · <TxLink hash={hash} />
        </p>
      ) : null}

      {error ? <p className="mt-1 max-w-md text-xs text-danger">{error}</p> : null}
      {receipt.isError ? (
        <p className="mt-1 text-xs text-danger">The transaction reverted on Arc.</p>
      ) : null}
    </div>
  );
}

/** Wallet and RPC errors are long; the first line is the part worth showing. */
function describeError(err: unknown): string {
  const message =
    (err as { shortMessage?: string })?.shortMessage ??
    (err instanceof Error ? err.message : String(err));
  if (/user rejected|denied/i.test(message)) return "You rejected the transaction.";
  return message.split("\n")[0].slice(0, 200);
}
