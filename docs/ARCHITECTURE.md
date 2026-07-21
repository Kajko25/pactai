# PactAI architecture

## Flow

1. **Post job.** Requester agent posts a job to the job board: task spec,
   budget cap, deadline. (`packages/shared` defines the `Job` type.)
2. **Discover + quote.** Executor agent polls the job board, evaluates jobs it
   can do, and posts a quote (price in USDC, ETA).
3. **Select + fund escrow.** Requester agent picks a quote — decision logic:
   `score = f(price, executor.reputation, ETA)` — then calls
   `JobEscrow.fund(jobId, executor, amount)`, transferring USDC into the
   contract. Gas is paid in USDC via Circle Paymaster.
4. **Do the work.** Executor agent performs the task and submits a result
   (a URI + hash) to the job board and calls
   `JobEscrow.submitResult(jobId, resultHash)`.
5. **Verify + release.** Requester agent fetches the result, checks the hash,
   and either:
   - `JobEscrow.release(jobId)` — pays the executor, or
   - lets the job's deadline lapse, or, in the MVP, explicitly calls
     `JobEscrow.refund(jobId)` if the result fails verification.
6. **Reputation update.** Job outcome (released / refunded / late) is written
   to the reputation ledger, read back into step 3's scoring on future jobs.

Both agents' spend-side tool calls (`fund`, `release`) go through the Claude
Agent SDK's `canUseTool` permission gate, mirroring Circle's own starter kit
— this keeps every USDC movement observable/approvable during the hackathon
demo, and can be flipped to fully autonomous (auto-approve under the budget
cap) once trusted.

## Why an escrow contract instead of pure x402 nanopayments

x402 (as wired up by Circle's Agent Nanopayments) is pay-per-HTTP-response:
you pay, you get bytes back in the same request. That's the right primitive
for the **quote** step above (cheap, instant, no wallet-to-wallet risk) but
the wrong primitive for the **job** itself, where the executor needs time to
produce a deliverable and the requester needs a way to not pay until the
deliverable is verified. `JobEscrow` is the piece Circle's stack doesn't give
you out of the box, and it's the part of PactAI that's actually novel versus
just running the reference demo.

## Contract sketch

```
JobEscrow
- fund(jobId, executor, amount)      // requester -> contract, USDC.transferFrom
- submitResult(jobId, resultHash)    // executor only
- release(jobId)                     // requester only, or auto after resultHash confirmed + timelock
- refund(jobId)                      // requester only, or anyone after deadline with no submitResult
- getJob(jobId) -> (requester, executor, amount, state, deadline, resultHash)
```

State machine: `Funded -> Delivered -> Released` or `Funded -> Refunded` /
`Delivered -> Refunded` (failed verification).

## Repo layout

```
pactai/
├── agents/
│   ├── requester-agent/     Claude Agent SDK app, in-process MCP tools for
│   │                        job-board + escrow + circle-tools
│   └── executor-agent/      same shape, opposite role
├── contracts/
│   └── JobEscrow.sol
├── services/
│   └── job-board/           minimal Express/Hono API: POST /jobs, POST
│                             /jobs/:id/quotes, GET /jobs, reputation store
├── packages/
│   └── shared/               Job/Quote/Reputation types + zod schemas
└── docs/
    ├── ARCHITECTURE.md
    └── PLAN.md
```

## Open questions to resolve early (week 1)

- Whether to register the executor's service on the public Circle Agent
  Marketplace (`agents.circle.com/services`) for discovery credit, or keep
  job discovery private to our own job-board for the demo — marketplace
  listing may involve a review process we don't have time for.
- Which Arc Testnet USDC/contract addresses and RPC to target — confirm via
  `docs.arc.io` and the Circle faucet before deploying `JobEscrow`.
- Whether `release` should auto-fire after a short timelock once
  `submitResult` is called (fully autonomous) or always wait for an explicit
  requester-agent approval (safer default for the demo).
