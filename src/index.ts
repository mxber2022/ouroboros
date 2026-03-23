// Ouroboros — Self-Funding AI Agent
// Starts all three agents: DataAgent, AnalysisAgent, Coordinator

import 'dotenv/config'
import { startDataAgent } from './dataAgent.ts'
import { startAnalysisAgent } from './analysisAgent.ts'
import { startCoordinator } from './coordinator.ts'
import { startFacilitator } from './facilitator.ts'
import { getAgentWallet, getUsdcBalance } from './config.ts'

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║         OUROBOROS — Self-Funding AI Agent                ║')
  console.log('║  Earns USDC by selling intelligence                      ║')
  console.log('║  Spends USDC to hire specialist agents                   ║')
  console.log('║  Powered by ampersend-sdk + Venice AI                    ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  const { account } = getAgentWallet()
  const startBalance = await getUsdcBalance(account.address)
  console.log(`Agent wallet: ${account.address}`)
  console.log(`Starting USDC balance: $${startBalance}\n`)

  // Start local facilitator first, then agents
  startFacilitator()
  await new Promise(r => setTimeout(r, 500))
  startDataAgent()
  await new Promise(r => setTimeout(r, 500))
  startAnalysisAgent()
  await new Promise(r => setTimeout(r, 500))
  startCoordinator()

  console.log('\n✓ All agents running. Send queries to the Coordinator:')
  console.log('  POST http://localhost:3000/query')
  console.log('  Body: { "owner": "l2beat", "repo": "l2beat", "projectName": "L2Beat" }')
  console.log('\n  GET  http://localhost:3000/ledger  ← live P&L')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
