# PactAI web

Next.js (App Router) dapp for the PactAI escrow on Arc Testnet.

| Route | What it is |
|---|---|
| `/` | Landing page: what PactAI does, the three-step "glass box", FAQ. The stat strip is read from Arc at request time, not hardcoded. |
| `/app` | Wallet-connected dashboard: USDC balances, ERC-8004 identity, reputation summary, and every job this wallet took part in. |
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
```

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
