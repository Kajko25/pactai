import path from "node:path";
import type { NextConfig } from "next";

const stub = "./stubs/x402-unsupported.cjs";

const nextConfig: NextConfig = {
  turbopack: {
    // The repo root holds bun.lock for the agent workspaces; without this the
    // bundler picks that directory as its root and warns on every build.
    root: path.resolve(__dirname),
    resolveAlias: {
      "@x402/core/client": stub,
      "@x402/evm": stub,
      "@x402/evm/exact/client": stub,
      "@x402/evm/upto/client": stub,
      "@x402/svm/exact/client": stub,
    },
  },
};

export default nextConfig;
