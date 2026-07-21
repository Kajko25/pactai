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

- [ ] Confirm Arc Testnet RPC, USDC address, faucet, block explorer
- [ ] Circle CLI installed + logged in, agent wallet created + funded on Arc Testnet
- [ ] Run the reference `claude-agent-sdk` starter kit end-to-end once, to
      confirm the wallet/x402/nanopayment flow works before building on it
- [ ] `packages/shared`: Job/Quote/Reputation types
- [ ] `services/job-board`: minimal in-memory (or SQLite) API — post job,
      list jobs, post quote, mark delivered
- [ ] `contracts/JobEscrow.sol`: fund/submitResult/release/refund, unit
      tested locally (Hardhat/Foundry) against a local chain before touching
      Arc Testnet
- [ ] Progress summary + repo link submitted at Checkpoint 2 (does not need
      to be complete — a placeholder/WIP is fine per the rules)

## Week 2–3 (26 Jul → 9 Aug)

- [ ] Deploy `JobEscrow` to Arc Testnet
- [ ] `requester-agent`: Claude Agent SDK app — posts a real job, scores
      incoming quotes, funds escrow, verifies + releases
- [ ] `executor-agent`: Claude Agent SDK app — polls job board, quotes,
      performs one concrete task type end-to-end (pick ONE task for the demo,
      e.g. "summarize this URL" or "validate this dataset" — narrow scope
      beats a vague general-purpose executor)
- [ ] Wire Circle Paymaster so both agents pay gas in USDC only
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
