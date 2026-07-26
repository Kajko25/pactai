// RainbowKit bundles a Base Account connector, which pulls in Coinbase's CDP
// SDK, which lazily imports the @x402/* packages for its x402 payment flows.
// PactAI's dashboard never uses that connector (see app/providers.tsx), so
// those packages are aliased here instead of installed — they would add a
// Solana toolchain to the bundle for code that cannot run.
//
// CommonJS on purpose: it lets any named import resolve at runtime, so the
// bundler is satisfied without us having to mirror each package's exports.
const message =
  "@x402/* is not bundled in the PactAI web app: the Base Account connector it belongs to is not enabled.";

module.exports = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === "__esModule") return true;
      if (typeof property === "symbol") return undefined;
      return function x402Unsupported() {
        throw new Error(message);
      };
    },
  },
);
