# PactAI — hackathon plan

Hackathon: Build on Arc. Track: Agentic Economy.

## Timeline

- Launch Event — Mon 13 Jul (past)
- Checkpoint 1 — Sun 19 Jul (past): project + team + idea
- **Checkpoint 2 — Sun 26 Jul: repo link + progress summary**
- Registration closes — Sat 8 Aug
- **Checkpoint 3 (final) — Sun 9 Aug: MVP on Arc, public repo, 3-min video, deck**
- Demo Day — Thu 20 Aug

All deadlines AoE (UTC-12). Submit early — late finals aren't judged.

## Week 1 (now → Checkpoint 2, 26 Jul)

- [x] Confirm Arc Testnet RPC, USDC address, faucet, block explorer
      (2026-07-21, via docs.arc.io: RPC `https://rpc.testnet.arc.network`,
      chainId `5042002`, USDC `0x3600000000000000000000000000000000000000`
      (6-decimal ERC-20 view of native USDC), explorer
      `https://testnet.arcscan.app`, faucet `https://faucet.circle.com`)
- [x] Circle CLI installed + logged in (agent wallet exists on ARC-TESTNET;
      per-agent wallets for the demo are a Week 2 item)
- [ ] Run the reference `claude-agent-sdk` starter kit end-to-end once, to
      confirm the wallet/x402/nanopayment flow works before building on it
- [x] Flagship demo task chosen: **SlotScout** (slot hunting) — see
      ARCHITECTURE.md; refund-on-timeout is a first-class demo path
- [x] `packages/shared`: Job/Quote/Reputation + Slot/SlotClaim types,
      canonical-JSON claim hashing, viem escrow client
- [x] `services/job-board`: in-memory Hono API with zod-validated inputs;
      plus `services/slot-source` (mock signal + verification oracle)
- [x] `contracts/JobEscrow.sol`: Foundry project, 21/21 unit tests against
      a 6-decimal MockUSDC (fund/submitResult/release, both refund paths,
      permission + wrong-state reverts)
- [x] Full local cycle proven on anvil (`bun run e2e`): post → quote →
      score → fund → slot appears → claim → deliver (board + chain) →
      verify vs oracle → release; AND fund → no slot → deadline → refund
- [ ] Progress summary + repo link submitted at Checkpoint 2 (does not need
      to be complete — a placeholder/WIP is fine per the rules)

## Week 2–3 (26 Jul → 9 Aug)

- [x] Deploy `JobEscrow` to Arc Testnet (2026-07-21, ahead of schedule:
      `0x52a8c98d90f5a2feef6aa07ebd25197456b4e4e7`, verified with cast —
      see docs/deployed.json)
- [ ] `requester-agent`: Claude Agent SDK app — posts a real job, scores
      incoming quotes, funds escrow, verifies + releases
- [ ] `executor-agent`: Claude Agent SDK app — polls job board, quotes,
      performs one concrete task type end-to-end (pick ONE task for the demo,
      e.g. "summarize this URL" or "validate this dataset" — narrow scope
      beats a vague general-purpose executor)
- [x] Requester agent spends from a **Circle Agent Wallet** (SCA via
      `circle wallet execute`, no key in env; WALLET_BACKEND=circle) —
      full cycle smoke-tested ON ARC (2026-07-21, `bun run smoke:arc`):
      fund → capture → verify → release AND fund → real 75s deadline →
      refund. Executor = local EOA (Circle provisions one testnet agent
      wallet per account; documented honestly). Gas is USDC natively on
      Arc — no separate Paymaster needed there.
- [ ] Reputation ledger feeding back into requester's quote scoring
- [ ] Full end-to-end dry run: post job → quote → fund → deliver → verify →
      release, on Arc Testnet, recorded
- [ ] Record 3-minute video pitch + demo
- [ ] Build submission deck
- [ ] Submit final checkpoint (repo, MVP, video, deck) — early, before the
      platform locks

## Definition of MVP done

One requester agent and one executor agent, each with their own funded Arc
Testnet agent wallet, complete one full job cycle end-to-end with real USDC
moving through `JobEscrow`, entirely without a human approving the individual
spend calls (or with approval visibly logged if we keep the human-in-the-loop
gate for the demo) — recorded as the 3-minute video.

## Cut list if time runs short

1. Drop the public Circle Agent Marketplace listing — keep job discovery on
   our own job-board only.
2. Drop the dispute/refund-on-bad-result path — keep only the happy path
   (fund → deliver → release) plus refund-on-timeout.
3. Drop the reputation ledger scoring and hardcode a single trusted executor
   for the demo.
4. Narrow the executor to exactly one task type, hardcoded, no negotiation —
   fixed price, only the escrow release path is agentic.
