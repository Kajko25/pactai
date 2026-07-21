# PactAI architecture

## Flagship task instantiation: SlotScout

The protocol below is task-agnostic; the MVP instantiates it with exactly one
task type (per the cut list): **slot hunting**. `Job.spec` carries a JSON
`SlotTask` (`{type: "slot-hunt", facility, notAfter}`), the executor polls
`services/slot-source` for appearing slots, and the deliverable is a
`SlotClaim` issued by the slot source when the hunter captures one. The slot
source doubles as the **verification oracle**: the requester re-fetches the
claim by id (never trusting executor-supplied bytes), checks
`keccak256(canonicalJson(claim))` against both the job-board result and the
on-chain `resultHash`, and only then releases. No slot before the deadline →
the escrow's timeout refund is the designed outcome, not an error path.

## Flow

1. **Post job.** Requester agent posts a job to the job board: task spec,
   budget cap, deadline. (`packages/shared` defines the `Job` type.)
2. **Discover + quote.** Executor agent polls the job board, evaluates jobs it
   can do, and posts a quote (price in USDC, ETA).
3. **Select + fund escrow.** Requester agent picks a quote — decision logic:
   `score = f(price, executor.reputation, ETA)` — then calls
   `JobEscrow.fund(jobId, executor, amount)`, transferring USDC into the
   contract. The requester spends from a Circle Agent Wallet (SCA via the
   Circle CLI); gas is USDC natively on Arc, paid from the same balance.
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
│   ├── requester-agent/     src/lib.ts = protocol logic (post/score/fund/
│   │                        verify/release/refund), src/index.ts = Claude
│   │                        Agent SDK wiring with canUseTool spend gate
│   └── executor-agent/      same shape, opposite role (quote/hunt/deliver)
├── contracts/
│   ├── src/JobEscrow.sol    Foundry project; 21 unit tests in test/
│   └── script/              DeployJobEscrow.s.sol (USDC_ADDRESS env)
├── services/
│   ├── job-board/           Hono API: jobs, quotes, results, reputation
│   └── slot-source/         mock agency: slots appear, get claimed, and
│                             claims are re-fetchable (the oracle)
├── packages/
│   └── shared/               types + zod schemas, canonical-JSON claim
│                             hashing, viem escrow client (anvil ⇄ Arc)
├── scripts/
│   └── e2e-local.ts          full-cycle proof on anvil, no LLM required
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
