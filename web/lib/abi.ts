// Only the fragments the dashboard actually touches. The full ABIs live in
// contracts/out after `forge build`; duplicating them here keeps the web app
// buildable without a Foundry toolchain (Vercel has none).

export const jobEscrowAbi = [
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "requester", type: "address" },
          { name: "executor", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "deadline", type: "uint64" },
          { name: "state", type: "uint8" },
          { name: "resultHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "JobFunded",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "requester", type: "address", indexed: true },
      { name: "executor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ResultSubmitted",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "resultHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobReleased",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "executor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobRefunded",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "requester", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const identityRegistryAbi = [
  {
    type: "function",
    name: "agentIdOf",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "totalRegistered",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

export const reputationRegistryAbi = [
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "totalJobs", type: "uint64" },
      { name: "released", type: "uint64" },
      { name: "releaseRate", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "getAgentJobs",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "outcome", type: "uint8" },
          { name: "recordedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "recordOutcome",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      { name: "agentId", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "OutcomeRecorded",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "outcome", type: "uint8", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
