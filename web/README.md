# PactAI web

Next.js (App Router) dapp for the PactAI escrow on Arc Testnet.

| Route | What it is |
|---|---|
| `/` | Landing page: what PactAI does, the three-step "glass box", FAQ. The stat strip is read from Arc at request time, not hardcoded. |
| `/app` | Wallet-connected dashboard: USDC balances, ERC-8004 identity, reputation summary, the requester flow (post → approve → fund → verify → release/refund), the executor flow (hunt → claim → submit), and every job this wallet took part in. |
| `/activity` | Read-only explorer: totals, registered agents with their reputation, and each job's full on-chain timeline. No wallet needed. |

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
```

No environment variables are required — the public Arc RPC and the deployed
contract addresses are defaults. Two optional overrides:

```bash
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.blockdaemon.testnet.arc.network
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...   # adds WalletConnect to the wallet list
NEXT_PUBLIC_SLOT_SOURCE_URL=http://localhost:4100   # oracle used to verify a delivered claim
NEXT_PUBLIC_JOB_BOARD_URL=http://localhost:4000     # optional: load a job's terms, post a result
```

Both service URLs are editable in the UI, so a deployed dashboard can still be
pointed at services running on the demo machine.

The public Arc RPC rate-limits aggressively; the Blockdaemon mirror above is
what the `smoke:arc` script uses when it needs headroom.

## How data is read

Arc caps `eth_getLogs` at a 10,000-block window and JobEscrow has been live for
hundreds of thousands of blocks, so walking the chain from the browser would be
~80 requests per page load. History therefore comes from the Arcscan
(Blockscout) API in a server component, and only per-wallet state (balances,
`agentIdOf`, `getSummary`) is read from the RPC. Logs are decoded here with the
ABIs in `lib/abi.ts` rather than trusting the explorer's own decoding, which is
empty for contracts whose source was never verified.

## Verifying a delivered result

JobEscrow stores money and a 32-byte result hash — not the job spec, and not
the deliverable. So the dashboard reproduces the requester agent's check in the
browser: fetch the claim back from the slot source by id (the executor's own
copy is not evidence), hash its canonical JSON, and compare against the chain.
The four checks it renders — hash matches, right facility, appointment early
enough, captured by the executor we hired — are exactly `hashClaim` +
`claimSatisfiesTask` from `packages/shared`.

`lib/claim.ts` duplicates that hashing rather than importing it: the shared
barrel also exports the Circle CLI escrow client, which shells out through
`node:child_process` and cannot be bundled for a browser. The duplication is
self-detecting — any drift shows up immediately as a hash mismatch against the
chain. A parity check against `packages/shared` is in the phase-4 commit.

The job spec (facility, appointment cutoff) lives in `localStorage`, since
nothing in the protocol puts it on-chain. Losing it loses only the labels: the
escrow, the funds, and the release/refund rights remain addressable by job id.

Release stays possible when verification fails — the button relabels itself
rather than disappearing. A UI that silently blocks the action would be lying
about who holds the arbiter role: on-chain, the requester does.

## Working as the executor

A job becomes work when the escrow says so: the dashboard lists jobs funded
with this wallet as the executor, read from the chain rather than from the job
board, so the assignment survives the board being down or never used.

What the chain does *not* carry is the task. Facility and appointment cutoff
are the requester's terms and travel off-chain — load them from the board by
job-board id, or type them in. Hunting the wrong facility produces a delivery
that fails the requester's verification, which is the correct outcome, so the
slot list marks which open slots would actually satisfy the job before you
claim one.

Claiming races: the slot source answers the second claimant with a 409, and the
UI says another hunter got there first rather than pretending it succeeded.
After a capture, `submitResult` commits `keccak256(canonicalJson(claim))` — the
value the requester recomputes. Posting the result to the job board is
best-effort and happens first; if the board is unreachable the on-chain
commitment still goes through, because that is the one that delivers the job.

To exercise both roles with a single wallet, post a job with your own address
as the executor. The escrow permits it and it is the fastest way to see the
whole cycle.

## Wallets

`app/providers.tsx` registers an injected connector (MetaMask, Rabby, Brave)
and, when a project id is configured, WalletConnect. Passkey/smart-wallet
connectors are deliberately not enabled. Arc Testnet is not a chain any wallet
library ships by default, so it is defined in `lib/chain.ts` and passed to
wagmi; a connected wallet on the wrong network is offered a switch (and, if it
does not know Arc, an add).

## Deploying

Vercel: set the project root to `web/`, framework Next.js, no env vars needed.
Pages revalidate every 30–60s, so the deployed site keeps up with the chain
without a rebuild.
