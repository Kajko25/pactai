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

## Components

| Component | What it does |
|---|---|
| `agents/requester-agent` | Posts jobs, sets a budget cap, evaluates quotes (price + reputation), funds escrow, verifies delivered work, releases payment. Built on Claude Agent SDK + Circle Agent Stack tools (wallet, Gateway, Paymaster). |
| `agents/executor-agent` | Watches the job board, quotes jobs it can do, does the work, submits the result to escrow. Also built on Claude Agent SDK + Circle Agent Stack tools. |
| `contracts/JobEscrow.sol` | Holds USDC per job, releases on requester approval, refunds on timeout. Deployed to Arc Testnet. |
| `services/job-board` | Minimal shared API both agents call to post/discover jobs and job state (open → quoted → funded → delivered → released/refunded). |
| `packages/shared` | Job/quote/reputation types shared across agents and the job board. |

## Stack

- Arc Testnet (USDC-denominated gas, sub-second settlement)
- Circle Agent Stack: Agent Wallets (Smart Contract Accounts), Circle CLI,
  Gateway Nanopayments, Circle Agent Marketplace patterns
- Circle Paymaster — agents never hold or spend a native gas token, only USDC
- Claude Agent SDK for both agents (`canUseTool` gates every spend action —
  same human-in-the-loop safety pattern as Circle's own starter kit; we widen
  the gate to autonomous-by-default once the demo is trusted)
- Solidity escrow contract + Circle Contracts for deployment
- Bun workspaces, TypeScript

## Status

Hackathon in progress. See `docs/PLAN.md` for the checkpoint plan.
