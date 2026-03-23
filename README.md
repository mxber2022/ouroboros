# Ouroboros — The Self-Funding AI Agent

> An AI agent that earns USDC by selling intelligence and spends USDC to hire specialist agents — growing its own balance autonomously with no human top-up required.

## The Problem

Every AI agent today needs a human to keep its wallet funded. You top it up, it spends, it runs out, it stops. The agent is economically dependent on humans forever.

## The Solution

Ouroboros is the first self-sustaining agent economy. Three agents coordinate via **x402 micropayments** (powered by `ampersend-sdk`) to form a complete earn-spend loop:

```
User pays $0.08
      ↓
 Coordinator (earns $0.08, keeps $0.01 margin)
      ├── pays DataAgent     $0.02 → GitHub metrics
      └── pays AnalysisAgent $0.05 → Venice AI scoring
```

After every query, the coordinator's balance grows by $0.01. No human intervention. No wallet top-ups. The agent funds itself.

## ampersend-sdk: Load-Bearing on Both Sides

The SDK is not a peripheral add-on — remove it and the system collapses:

**Earning side** (x402 server):
```typescript
app.use(paymentMiddleware(account.address, {
  '/query': { price: '$0.08', network: 'base-sepolia' }
}))
```
Without this: no payments accepted, agent earns nothing.

**Spending side** (x402 client via ampersend-sdk):
```typescript
const wallet = AccountWallet.fromPrivateKey(privateKey)
const treasurer = new NaiveTreasurer(wallet)
const client = wrapWithAmpersend(new x402Client(), treasurer, ['base-sepolia'])
const payingFetch = wrapFetchWithPayment(fetch, client)

// Auto-pays 402 responses — coordinator can hire sub-agents
const result = await payingFetch('http://localhost:3001/data', { ... })
```
Without this: coordinator cannot pay sub-agents, swarm collapses.

## Run It

```bash
git clone https://github.com/mxber2022/ouroboros
cd ouroboros
npm install

cp .env.example .env
# Fill in AGENT_PRIVATE_KEY and VENICE_API_KEY

# Run the full demo (3 queries, shows growing P&L)
npm run demo
```

## Demo Output (Live Run — Base Sepolia)

```
Agent wallet:        0x7337abD680749819D3eb97A1F52eE58e484EAe0c
Starting balance:    $16.848 USDC

Query 1/3: Analyzing L2Beat...
  ┌─ L2Beat
  │  GitHub: 650 stars | 889 commits/90d | 334 contributors
  │  Score:  6.5/10 (growing)
  │
  │  💰 Agent Economics after query 1:
  │     Earned:  $0.08 USDC
  │     Spent:   $0.07 USDC (sub-agents)
  │     Margin:  $0.01 USDC ← agent grew its balance
  └─────────────────────────────────────────────

Query 2/3: Analyzing Rotki...
  ┌─ Rotki
  │  GitHub: 3746 stars | 858 commits/90d | 205 contributors
  │  Score:  8/10 (growing)
  │
  │  💰 Agent Economics after query 2:
  │     Earned:  $0.16 USDC
  │     Spent:   $0.14 USDC
  │     Margin:  $0.02 USDC ← agent grew its balance
  └─────────────────────────────────────────────

Query 3/3: Analyzing DAppNode...
  ┌─ DAppNode
  │  GitHub: 624 stars | 0 commits/90d | 27 contributors
  │  Score:  5/10 (declining)
  │
  │  💰 Agent Economics after query 3:
  │     Earned:  $0.24 USDC
  │     Spent:   $0.21 USDC
  │     Margin:  $0.03 USDC ← agent grew its balance
  └─────────────────────────────────────────────

FINAL LEDGER:
  Total earned:  $0.24 USDC
  Total spent:   $0.21 USDC
  Net margin:    $0.03 USDC
  Queries:       3

Ouroboros: the agent that funds itself. No human top-up required.
```

### On-Chain Settlement Proof (Base Sepolia)

All 9 USDC transfers settled on-chain via `transferWithAuthorization` (EIP-3009):

| Payment | Amount | Tx Hash |
|---------|--------|---------|
| DataAgent Q1 | $0.02 | [`0x70b497...`](https://sepolia.basescan.org/tx/0x70b497d921e27102a68bfd3579f3d1f869b52875dcb34cf718ca992e90e08a0a) |
| AnalysisAgent Q1 | $0.05 | [`0x2ef521...`](https://sepolia.basescan.org/tx/0x2ef521d3d122ca760f6918806aa9bee79cb3bcf3678b1dbb60e68732c28342b6) |
| Coordinator Q1 | $0.08 | [`0x041f0c...`](https://sepolia.basescan.org/tx/0x041f0ca6626351a7d8e50889ae524a3828857475e2c92f9ee0e8b976c62ee1ac) |
| DataAgent Q2 | $0.02 | [`0x02fbf8...`](https://sepolia.basescan.org/tx/0x02fbf8c0204e2e4a361acce22105ea7b96e4cc521edeaeacb75df56be4bec8ee) |
| AnalysisAgent Q2 | $0.05 | [`0x4dec28...`](https://sepolia.basescan.org/tx/0x4dec28b2d9393470d871a761c1f3ef8c425de233d4442e6f2347e8bc92646f81) |
| Coordinator Q2 | $0.08 | [`0xafb527...`](https://sepolia.basescan.org/tx/0xafb527b822d4c0b86eab1c4146ca0e7e7b2d8ea00022d1b7d045bc6248c0c71a) |
| DataAgent Q3 | $0.02 | [`0x3d7ddb...`](https://sepolia.basescan.org/tx/0x3d7ddb98ca88974d70a300b2562a54097ce648ab70082264c6531d7eb14e8cf4) |
| AnalysisAgent Q3 | $0.05 | [`0x28cd52...`](https://sepolia.basescan.org/tx/0x28cd5256effd7d3c8e0914b8ba03517ebd937aca8e79d5d184e058a24f723064) |
| Coordinator Q3 | $0.08 | [`0x987b35...`](https://sepolia.basescan.org/tx/0x987b359d259d6738822a1923d561d1a433a8f992c31d791c802d9f459d5e9bfe) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User / Client                      │
│         pays $0.08 USDC via x402                     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Coordinator Agent :3000                 │
│  EARNS: $0.08/query (x402 paymentMiddleware)         │
│  SPENDS: $0.07/query (ampersend wrapFetchWithPayment)│
│  MARGIN: $0.01/query ← grows autonomously            │
└──────────┬──────────────────────────┬───────────────┘
           │ pays $0.02               │ pays $0.05
┌──────────▼──────────┐   ┌───────────▼──────────────┐
│   DataAgent :3001   │   │  AnalysisAgent :3002      │
│  GitHub API metrics │   │  Venice AI (llama-3.3-70b)│
│  x402 gated         │   │  x402 gated, no retention │
└─────────────────────┘   └──────────────────────────-┘
```

## Live Endpoints

| Agent | Port | Endpoint | Price |
|-------|------|----------|-------|
| Coordinator | 3000 | `POST /query` | $0.08 USDC |
| Coordinator | 3000 | `GET /ledger` | free |
| DataAgent | 3001 | `POST /data` | $0.02 USDC |
| AnalysisAgent | 3002 | `POST /analyze` | $0.05 USDC |

## Tech Stack

- **ampersend-sdk** — x402 payment handling (earning + spending)
- **x402-express** — payment middleware for Express servers
- **@x402/fetch** — auto-paying fetch wrapper
- **Venice AI** — llama-3.3-70b, no data retention
- **Base Sepolia** — USDC payments on testnet
- **TypeScript + Node.js**

## Track

Submitted to: **Best Agent Built with ampersend-sdk** (Synthesis Hackathon)
