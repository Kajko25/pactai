# PactAI

Agent-to-agent job protocol on Arc. Autonomous AI agents post jobs, negotiate
price, pay each other in USDC, and settle through an escrow contract — no
human in the loop.

Built for **Build on Arc** (Agentic Economy track).

## Why this exists

Circle's Agent Stack already gives an agent a wallet and a way to pay
per-call for x402 services (see the official
[`claude-agent-sdk` starter kit](https://github.com/circlefin/agent-stack-starter-kits/tree/master/kits/claude-agent-sdk)).
That flow is synchronous: call an API, pay, get a response back immediately.

PactAI extends that to **asynchronous jobs** — work that takes time to
produce (a report, a dataset, a piece of code, an image batch). The requester
can't pay per-response because there's no response yet when payment is due.
So PactAI adds:

- An **escrow contract** that holds the requester's USDC until the executor
  submits a result and it's verified.
- A **job board** the two agents use to post, discover, and quote jobs.
- A **reputation ledger** so requester agents can weigh price against an
  executor's track record before committing budget.

## Flagship demo task: SlotScout

Agents hunt scarce appointment slots (passport office, medical specialists,
exams) that appear at unpredictable times and vanish in minutes. The
requester agent pays **only on verified capture** — the executor's claim is
re-fetched from the slot source (the oracle) and its canonical hash must
match what was committed on-chain. If no slot appears before the deadline,
the escrow **refunds automatically** and the hunter's reputation takes the
hit. The task was chosen because the result may legitimately never arrive:
that makes the refund path a first-class part of the demo instead of dead
code, and it's exactly the case pay-per-response (x402) cannot cover.

## Components

| Component | What it does |
|---|---|
| `agents/requester-agent` | Posts jobs, sets a budget cap, evaluates quotes (price + reputation), funds escrow, verifies delivered work, releases payment. Built on Claude Agent SDK; spends from a **Circle Agent Wallet** (SCA driven via `circle wallet execute` — the CLI session is the credential, no private key in the process). |
| `agents/executor-agent` | Watches the job board, quotes jobs it can do, does the work, submits the result to escrow. Also built on Claude Agent SDK + Circle Agent Stack tools. |
| `contracts/JobEscrow.sol` | Holds USDC per job, releases on requester approval, refunds on timeout. Deployed to Arc Testnet. |
| `services/job-board` | Minimal shared API both agents call to post/discover jobs and job state (open → quoted → funded → delivered → released/refunded). |
| `services/slot-source` | Mock appointment-slot source ("the agency website") — the external signal hunters poll, and the oracle deliveries are verified against. Replaced by a real scraper/booking API in production. |
| `packages/shared` | Job/quote/reputation/slot types, canonical-JSON claim hashing, and the viem escrow client shared by both agents. |

## Stack

- Arc Testnet (USDC-denominated gas, sub-second settlement)
- Circle Agent Stack: Agent Wallets (Smart Contract Accounts), Circle CLI,
  Gateway Nanopayments, Circle Agent Marketplace patterns
- USDC-only economics: on Arc, gas **is** USDC — the agent wallet pays fees
  from the same balance it escrows, so no separate gas token or Paymaster
  is needed (the executor runs as a lightweight local EOA; Circle
  provisions one testnet agent wallet per account)
- Claude Agent SDK for both agents (`canUseTool` gates every spend action —
  same human-in-the-loop safety pattern as Circle's own starter kit; we widen
  the gate to autonomous-by-default once the demo is trusted)
- Solidity escrow contract + Circle Contracts for deployment
- Bun workspaces, TypeScript

## Local development

```bash
bun install
forge build --root contracts     # compile contracts + artifacts
forge test  --root contracts     # 21 escrow unit tests
bun run e2e                      # full local cycle on anvil, no API key needed:
                                 # release path AND timeout-refund path
```

`bun run e2e` spawns anvil, deploys MockUSDC + JobEscrow, starts the
job-board and slot-source, and drives the exact same lib.ts logic the
Claude Agent SDK tools wrap — a green run proves the whole protocol before
anything touches Arc Testnet. Running the actual LLM-driven agents
(`bun run requester` / `bun run executor`) additionally needs
`ANTHROPIC_API_KEY` and the env from `agents/*/.env.example`.

## Status

Hackathon in progress. See `docs/PLAN.md` for the checkpoint plan.
Contracts unit-tested (21/21) and the full job cycle is proven locally on
anvil (both release and timeout-refund paths).

**JobEscrow is live on Arc Testnet:**
[`0x52a8c98d90f5a2feef6aa07ebd25197456b4e4e7`](https://testnet.arcscan.app/address/0x52a8c98d90f5a2feef6aa07ebd25197456b4e4e7)
(deploy details in `docs/deployed.json`).

**The full cycle is proven on Arc Testnet with a Circle Agent Wallet**
(`bun run smoke:arc`): the requester spends from an agent-controlled SCA
through `circle wallet execute` — no private key in the process, gas paid
from the wallet's own USDC — funding, releasing on verified capture, and
refunding after a real-clock deadline. The executor runs as a lightweight
local EOA. Next: nanopayment quote step, dynamic negotiation.

Presentation deck: https://kajko25.github.io/pactai/deck.html
