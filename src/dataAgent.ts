// Data Agent — x402-gated GitHub metrics service
// Earns $0.02 USDC per lookup on Base Sepolia
// Remove ampersend and this agent earns nothing — SDK is load-bearing

import express from 'express'
import { paymentMiddleware } from 'x402-express'
import { getAgentWallet, PORTS, PRICES, CHAIN } from './config.ts'
import { FACILITATOR_URL } from './facilitator.ts'

export interface GitHubMetrics {
  owner: string
  repo: string
  stars: number
  forks: number
  openIssues: number
  contributors: number
  commitsLast90Days: number
  weeklyCommitAvg: number
  lastCommitAt: string
  language: string | null
}

async function fetchGitHubData(owner: string, repo: string): Promise<GitHubMetrics> {
  const headers: Record<string, string> = { 'User-Agent': 'Ouroboros-Agent' }
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`

  const [repoRes, activityRes, contribRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=true`, { headers }),
  ])

  const repoData = await repoRes.json() as Record<string, unknown>
  const activityData = await activityRes.json() as Array<{ total: number }>
  const contribData = await contribRes.json()

  const weeks = Array.isArray(activityData) ? activityData.slice(-13) : []
  const commitsLast90Days = weeks.reduce((s, w) => s + (w.total || 0), 0)
  const weeklyCommitAvg = weeks.length > 0 ? Math.round(commitsLast90Days / weeks.length * 10) / 10 : 0

  const linkHeader = (contribRes.headers.get('link') || '')
  const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/)
  const contributors = lastPageMatch ? parseInt(lastPageMatch[1]) : (Array.isArray(contribData) ? contribData.length : 0)

  return {
    owner,
    repo,
    stars: (repoData.stargazers_count as number) || 0,
    forks: (repoData.forks_count as number) || 0,
    openIssues: (repoData.open_issues_count as number) || 0,
    contributors,
    commitsLast90Days,
    weeklyCommitAvg,
    lastCommitAt: (repoData.pushed_at as string) || '',
    language: (repoData.language as string | null) || null,
  }
}

export function startDataAgent() {
  const app = express()
  app.use(express.json())

  const { account } = getAgentWallet()

  // x402 payment middleware — all routes under /data require payment
  // This is the ampersend-sdk integration: no payment = no data
  app.use(paymentMiddleware(
    account.address,
    { '/data': { price: PRICES.dataAgent, network: 'base-sepolia' } },
    { url: FACILITATOR_URL },
  ))

  app.post('/data', async (req, res) => {
    const { owner, repo } = req.body as { owner: string; repo: string }
    if (!owner || !repo) {
      res.status(400).json({ error: 'owner and repo required' })
      return
    }
    try {
      const metrics = await fetchGitHubData(owner, repo)
      res.json({ metrics, pricePaid: PRICES.dataAgent, agent: 'DataAgent v1' })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.get('/health', (_req, res) => {
    res.json({ agent: 'DataAgent', price: PRICES.dataAgent, wallet: account.address })
  })

  app.listen(PORTS.dataAgent, () => {
    console.log(`[DataAgent] Listening on :${PORTS.dataAgent} — charges ${PRICES.dataAgent} USDC per GitHub lookup`)
    console.log(`[DataAgent] Wallet: ${account.address}`)
  })

  return app
}
