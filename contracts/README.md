# JobEscrow — deploy notes

`JobEscrow.sol` is an MVP-scope escrow: fund → submitResult → release, with a
timeout-based refund path. No disputes, no partial release — see the cut
list in `docs/PLAN.md`.

## TODO before deploying to Arc Testnet

1. Pull the Arc Testnet USDC contract address and RPC endpoint from
   `docs.arc.io` / the Circle faucet (`https://faucet.circle.com`) — do not
   guess it, confirm it in the docs at build time since testnet addresses can
   change.
2. Install OpenZeppelin contracts (`forge install OpenZeppelin/openzeppelin-contracts`
   or `npm install @openzeppelin/contracts` if using Hardhat) — this file
   imports `IERC20`/`SafeERC20` from there.
3. Unit test locally first (Foundry `forge test` against a mock ERC20) before
   spending real Arc Testnet USDC on deploys.
4. Deploy via Circle Contracts (`developers.circle.com/contracts`) or a
   standard Foundry/Hardhat deploy script pointed at the Arc Testnet RPC —
   both are documented; pick whichever the team is faster with.
5. Record the deployed address in `agents/*/.env.example` as
   `JOB_ESCROW_ADDRESS`.
