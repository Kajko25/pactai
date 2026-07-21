# JobEscrow — contract notes

`src/JobEscrow.sol` is an MVP-scope escrow: fund → submitResult → release,
with a timeout-based refund path. No disputes, no partial release — see the
cut list in `docs/PLAN.md`.

## Status

- **Deployed on Arc Testnet:** `0x52a8c98d90f5a2feef6aa07ebd25197456b4e4e7`
  (chainId `5042002`, USDC `0x3600000000000000000000000000000000000000` —
  the 6-decimal ERC-20 view of Arc's native gas USDC). Full record in
  `docs/deployed.json`, verified post-deploy with `cast`.
- **21/21 unit tests** (`forge test`): full state-machine coverage against a
  6-decimal MockUSDC — both refund paths, permission and wrong-state
  reverts, and the two demo lifecycles (release, timeout).

## Working with it

```bash
forge build          # artifacts consumed by scripts/e2e-local.ts
forge test           # 21 tests
```

Redeploy (key comes from the gitignored `.env`, never a CLI flag):

```bash
USDC_ADDRESS=0x3600000000000000000000000000000000000000 \
  forge script script/DeployJobEscrow.s.sol --rpc-url arc --broadcast
```

After a redeploy, update `docs/deployed.json` — both agents and
`scripts/smoke-arc.ts` read the address from there.
