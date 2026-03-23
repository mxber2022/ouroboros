// Coordinator Agent — the self-funding core of Ouroboros
//
// EARNS: $0.08 USDC per query (x402 paywall via x402-express)
// SPENDS: $0.02 (DataAgent) + $0.05 (AnalysisAgent) = $0.07 per query
// MARGIN: $0.01 per query — the agent grows its own balance autonomously
//
// ampersend-sdk is load-bearing on BOTH sides:
//   - Earning: x402 paymentMiddleware gates incoming requests
//   - Spending: wrapWithAmpersend + wrapFetchWithPayment pays sub-agents

import express from 'express'
import { paymentMiddleware } from 'x402-express'
import { getAgentWallet, getPayingFetch, PORTS, PRICES, CHAIN, getUsdcBalance } from './config.ts'
import { FACILITATOR_URL } from './facilitator.ts'
import type { AnalysisResult } from './analysisAgent.ts'
import type { GitHubMetrics } from './dataAgent.ts'

export interface QueryResult {
  project: string
  github: GitHubMetrics
  analysis: AnalysisResult
  economics: {
    earned: string
    spent: string
    margin: string
    runningBalance: string
  }
}

// In-memory P&L tracker
const ledger = { earned: 0, spent: 0, queries: 0 }

export function startCoordinator() {
  const app = express()
  app.use(express.json())

  const { account } = getAgentWallet()
  const payingFetch = getPayingFetch()  // auto-pays x402 sub-agents via ampersend-sdk

  // x402 gate — coordinator charges $0.08 per analysis query
  app.use(paymentMiddleware(
    account.address,
    { '/query': { price: PRICES.coordinator, network: 'base-sepolia' } },
    { url: FACILITATOR_URL },
  ))

  app.post('/query', async (req, res) => {
    const { owner, repo, projectName, description, totalFunding } = req.body as {
      owner: string
      repo: string
      projectName?: string
      description?: string
      totalFunding?: number
    }

    if (!owner || !repo) {
      res.status(400).json({ error: 'owner and repo required' })
      return
    }

    console.log(`\n[Coordinator] Query received: ${owner}/${repo}`)
    const name = projectName || `${owner}/${repo}`

    try {
      // Step 1: Pay DataAgent $0.02 for GitHub metrics
      // ampersend-sdk's wrapFetchWithPayment handles the 402 response automatically
      console.log(`[Coordinator] → Paying DataAgent ${PRICES.dataAgent} for GitHub data...`)
      const dataRes = await payingFetch(`http://localhost:${PORTS.dataAgent}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      })

      if (!dataRes.ok) throw new Error(`DataAgent failed: ${dataRes.status}`)
      const { metrics } = await dataRes.json() as { metrics: GitHubMetrics }
      console.log(`[Coordinator] ✓ GitHub data received (${metrics.stars} stars, ${metrics.commitsLast90Days} commits/90d)`)
      ledger.spent += 0.02

      // Small delay to avoid x402 nonce collision between sequential payments
      await new Promise(r => setTimeout(r, 2000))

      // Step 2: Pay AnalysisAgent $0.05 for Venice AI reasoning
      console.log(`[Coordinator] → Paying AnalysisAgent ${PRICES.analysisAgent} for AI analysis...`)
      const analysisRes = await payingFetch(`http://localhost:${PORTS.analysisAgent}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name, description, metrics, totalFunding }),
      })

      if (!analysisRes.ok) throw new Error(`AnalysisAgent failed: ${analysisRes.status}`)
      const { analysis } = await analysisRes.json() as { analysis: AnalysisResult }
      console.log(`[Coordinator] ✓ Analysis received (score: ${analysis.overallScore}/10, trend: ${analysis.trend})`)
      ledger.spent += 0.05

      // Step 3: Record earnings and compute margin
      ledger.earned += 0.08
      ledger.queries += 1

      const margin = ledger.earned - ledger.spent
      const walletBalance = await getUsdcBalance(account.address)

      console.log(`[Coordinator] 💰 Ledger: earned $${ledger.earned.toFixed(2)} | spent $${ledger.spent.toFixed(2)} | margin $${margin.toFixed(2)}`)

      const result: QueryResult = {
        project: name,
        github: metrics,
        analysis,
        economics: {
          earned: `$${ledger.earned.toFixed(2)}`,
          spent: `$${ledger.spent.toFixed(2)}`,
          margin: `$${margin.toFixed(2)}`,
          runningBalance: `$${walletBalance} USDC`,
        }
      }

      res.json(result)
    } catch (err) {
      console.error(`[Coordinator] ✗ Error: ${err}`)
      res.status(500).json({ error: String(err) })
    }
  })

  // Public ledger endpoint — anyone can audit the agent's economics
  app.get('/ledger', (_req, res) => {
    res.json({
      agent: 'Coordinator (Ouroboros)',
      wallet: account.address,
      earned: `$${ledger.earned.toFixed(2)} USDC`,
      spent: `$${ledger.spent.toFixed(2)} USDC`,
      margin: `$${(ledger.earned - ledger.spent).toFixed(2)} USDC`,
      queries: ledger.queries,
      pricePerQuery: PRICES.coordinator,
      subAgentCosts: { data: PRICES.dataAgent, analysis: PRICES.analysisAgent },
    })
  })

  app.get('/health', (_req, res) => {
    res.json({ agent: 'Coordinator', price: PRICES.coordinator, wallet: account.address })
  })

  app.listen(PORTS.coordinator, () => {
    console.log(`[Coordinator] Listening on :${PORTS.coordinator} — charges ${PRICES.coordinator} USDC per full analysis`)
    console.log(`[Coordinator] Wallet: ${account.address}`)
    console.log(`[Coordinator] Economics: earn $0.08 → pay DataAgent $0.02 + AnalysisAgent $0.05 → keep $0.01`)
  })

  return app
}
