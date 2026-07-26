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
- [x] ERC-8004 identity + reputation deployed on Arc Testnet (2026-07-26):
      `IdentityRegistry` (`0x9bAb9a3dc64A7D449728dC5C6F5cc47Af337C1e7`) — fresh
      deploy, not shared with DAO-WARDEN's registry even though same wallet
      cluster; `JobReputationRegistry`
      (`0x992aA6B918Cf7916fE1F8e43cB3E0FEb6915A835`) — deliberately no
      validator (unlike DAO-WARDEN): `recordOutcome(jobId)` is permissionless
      and reads JobEscrow's own terminal state (Released/Refunded) directly,
      since that state is already final and there's nothing to game. 13/13
      new Foundry tests. See docs/deployed.json for addresses/tx hashes.
- [x] Registered both agents on Arc Testnet (2026-07-26): executor
      agentId **1** (`0xA3A23dc9...604829`, self-registered directly),
      requester agentId **2** (`0x03d1c300...87734e`, registered via
      `circle wallet execute` since it's a Circle Agent Wallet). AgentCards
      are inline `data:application/json;base64,...` URIs (no IPFS infra
      here). Called `recordOutcome` on the 3 completed jobs found from the
      smoke-test cycle (2 Released, 1 Refunded) -- first real reputation
      entries: `getSummary(1)` reads **3 total jobs, 2 released, 66%
      release rate**, independently verified with `cast`.
- [x] Web dapp phases 1–3 (2026-07-26), in `web/`: landing page + FAQ,
      wallet connect (RainbowKit, injected-only, Arc defined as a custom
      chain) with an identity/reputation/own-jobs dashboard, and a read-only
      Activity explorer. Job history is read from the Arcscan API in a
      server component (Arc caps `eth_getLogs` at 10k blocks, so a browser
      walk from the deploy block would be ~80 requests) and decoded with our
      own ABIs; per-wallet state comes straight from the RPC.
- [x] Web dapp phase 4 (2026-07-26): requester flow in the browser — post a
      job (exact-amount approve → fund), track it against the chain, then
      release or refund. The proof problem is solved the way the agent solves
      it: the dashboard re-fetches the claim from the slot source, re-hashes
      its canonical JSON and renders four plain checks (hash matches chain /
      right facility / appointment early enough / captured by the executor we
      hired) instead of a raw `bytes32`. Release is deliberately still
      possible when the proof fails, but the button says so. Also: settled
      jobs offer `recordOutcome`, and the slot source now sends CORS on its
      read routes so a browser can verify. Hash and jobId derivation verified
      byte-identical to `packages/shared`; `bun run e2e` still green.
- [x] Web dapp phase 5 (2026-07-26): executor flow in the browser — a job
      appears as work when someone funds it naming your wallet (read from the
      chain, not from the board), then hunt the facility, race to claim a
      slot, and commit `keccak256(canonicalJson(claim))` via `submitResult`.
      The requester's terms are loaded from the job board by board id when
      available and typed in otherwise, because the escrow deliberately does
      not carry them. Both services now send CORS (the board everywhere, the
      slot source on everything except the `/admin/spawn` harness hook).
      Verified with browser-origin requests end to end: hunt → claim → hash →
      the phase-4 panel's verdict, plus the 409 race and a wrong-facility
      delivery being rejected. `bun run e2e` still green.
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
