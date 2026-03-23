// Ouroboros Demo — shows the self-funding loop end-to-end
// Simulates 3 queries and prints the growing P&L after each

import 'dotenv/config'
import { startDataAgent } from './dataAgent.ts'
import { startAnalysisAgent } from './analysisAgent.ts'
import { startCoordinator } from './coordinator.ts'
import { startFacilitator } from './facilitator.ts'
import { getAgentWallet, getPayingFetch, getUsdcBalance, PORTS } from './config.ts'
import type { QueryResult } from './coordinator.ts'

const DEMO_PROJECTS = [
  { owner: 'l2beat',    repo: 'l2beat',    projectName: 'L2Beat',    description: 'Ethereum L2 analytics and risk assessment platform' },
  { owner: 'rotki',     repo: 'rotki',     projectName: 'Rotki',     description: 'Open source portfolio tracker and accounting tool' },
  { owner: 'DAppNode',  repo: 'DAppNode',  projectName: 'DAppNode',  description: 'Decentralized infrastructure for running blockchain nodes' },
]

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║       OUROBOROS — Self-Funding Agent Demo                ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  const { account } = getAgentWallet()

  // Demo client uses the HUMAN wallet to pay the agent economy
  // This separates the payer from the agent (same wallet can't pay itself via x402)
  const humanPk = (process.env.HUMAN_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY) as `0x${string}`
  const payingFetch = getPayingFetch(humanPk)

  const startBalance = await getUsdcBalance(account.address)
  console.log(`Agent wallet:        ${account.address}`)
  console.log(`Starting balance:    $${startBalance} USDC\n`)

  // Start local facilitator first, then agents
  console.log('Starting agents...')
  startFacilitator()
  await sleep(500)
  startDataAgent()
  startAnalysisAgent()
  await sleep(300)
  startCoordinator()
  await sleep(1000) // wait for servers to bind

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Running 3 queries through the agent economy...')
  console.log('  Each query: earn $0.08 → pay DataAgent $0.02 + AnalysisAgent $0.05 → keep $0.01')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  for (let i = 0; i < DEMO_PROJECTS.length; i++) {
    const project = DEMO_PROJECTS[i]
    console.log(`\nQuery ${i + 1}/3: Analyzing ${project.projectName}...`)

    try {
      // Pay coordinator $0.08 (ampersend handles 402 automatically)
      const res = await payingFetch(`http://localhost:${PORTS.coordinator}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        console.log(`  ✗ Query failed: ${res.status} — ${JSON.stringify(errBody)}`)
        continue
      }

      const result = await res.json() as QueryResult

      console.log(`\n  ┌─ ${result.project} `)
      console.log(`  │  GitHub: ${result.github.stars} stars | ${result.github.commitsLast90Days} commits/90d | ${result.github.contributors} contributors`)
      console.log(`  │  Score:  ${result.analysis.overallScore}/10 (${result.analysis.trend})`)
      console.log(`  │  Insight: ${result.analysis.insight?.slice(0, 100)}...`)
      console.log(`  │`)
      console.log(`  │  💰 Agent Economics after query ${i + 1}:`)
      console.log(`  │     Earned:  ${result.economics.earned} USDC`)
      console.log(`  │     Spent:   ${result.economics.spent} USDC (sub-agents)`)
      console.log(`  │     Margin:  ${result.economics.margin} USDC ← agent grew its balance`)
      console.log(`  └─────────────────────────────────────────────`)
    } catch (err) {
      console.log(`  ✗ Error: ${err}`)
    }

    await sleep(3000)
  }

  // Final ledger
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('FINAL LEDGER:')
  const ledgerRes = await fetch(`http://localhost:${PORTS.coordinator}/ledger`)
  const ledger = await ledgerRes.json() as Record<string, unknown>
  console.log(`  Total earned:  ${ledger.earned}`)
  console.log(`  Total spent:   ${ledger.spent}`)
  console.log(`  Net margin:    ${ledger.margin}`)
  console.log(`  Queries:       ${ledger.queries}`)
  console.log('\nOuroboros: the agent that funds itself. No human top-up required.')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  process.exit(0)
}

main().catch(err => {
  console.error('Demo error:', err)
  process.exit(1)
})
