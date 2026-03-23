// Analysis Agent — x402-gated Venice AI reasoning service
// Earns $0.05 USDC per analysis on Base Sepolia
// Venice AI: no data retention — private reasoning stays private

import express from 'express'
import { paymentMiddleware } from 'x402-express'
import { getAgentWallet, PORTS, PRICES, CHAIN } from './config.ts'
import { FACILITATOR_URL } from './facilitator.ts'
import type { GitHubMetrics } from './dataAgent.ts'

const VENICE_API = 'https://api.venice.ai/api/v1/chat/completions'

export interface AnalysisResult {
  impactScore: number        // 1-10
  sustainabilityScore: number
  communityScore: number
  fundingEfficiencyScore: number
  overallScore: number
  trend: 'growing' | 'stable' | 'declining'
  insight: string
  recommendation: string
  redFlags: string[]
}

async function runVeniceAnalysis(
  projectName: string,
  description: string,
  metrics: GitHubMetrics,
  totalFunding: number
): Promise<AnalysisResult> {
  const apiKey = process.env.VENICE_API_KEY
  if (!apiKey) throw new Error('VENICE_API_KEY not set')

  const res = await fetch(VENICE_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages: [
        {
          role: 'system',
          content: 'You are an expert analyst evaluating public goods projects. Return ONLY valid JSON, no markdown.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            project: { name: projectName, description, totalFundingUSD: totalFunding },
            github: metrics,
            task: 'Score this project 1-10 on impact, sustainability, community, fundingEfficiency. Return: { "impactScore": number, "sustainabilityScore": number, "communityScore": number, "fundingEfficiencyScore": number, "overallScore": number, "trend": "growing"|"stable"|"declining", "insight": string, "recommendation": string, "redFlags": string[] }'
          })
        }
      ],
      temperature: 0.2
    })
  })

  if (!res.ok) throw new Error(`Venice API ${res.status}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const raw = data.choices[0].message.content.trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Venice returned non-JSON')
  return JSON.parse(jsonMatch[0]) as AnalysisResult
}

export function startAnalysisAgent() {
  const app = express()
  app.use(express.json())

  const { account } = getAgentWallet()

  // x402 payment gate — ampersend-sdk is load-bearing:
  // no payment = no Venice AI analysis
  app.use(paymentMiddleware(
    account.address,
    { '/analyze': { price: PRICES.analysisAgent, network: 'base-sepolia' } },
    { url: FACILITATOR_URL },
  ))

  app.post('/analyze', async (req, res) => {
    const { projectName, description, metrics, totalFunding } = req.body as {
      projectName: string
      description: string
      metrics: GitHubMetrics
      totalFunding: number
    }

    if (!projectName || !metrics) {
      res.status(400).json({ error: 'projectName and metrics required' })
      return
    }

    try {
      const analysis = await runVeniceAnalysis(projectName, description || '', metrics, totalFunding || 0)
      res.json({ analysis, pricePaid: PRICES.analysisAgent, agent: 'AnalysisAgent v1' })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.get('/health', (_req, res) => {
    res.json({ agent: 'AnalysisAgent', price: PRICES.analysisAgent, wallet: account.address })
  })

  app.listen(PORTS.analysisAgent, () => {
    console.log(`[AnalysisAgent] Listening on :${PORTS.analysisAgent} — charges ${PRICES.analysisAgent} USDC per Venice AI analysis`)
    console.log(`[AnalysisAgent] Wallet: ${account.address}`)
  })

  return app
}
