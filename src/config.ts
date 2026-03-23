// Ouroboros — shared config and wallet setup
import 'dotenv/config'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { createPublicClient, http, formatUnits, type Address } from 'viem'
import { AccountWallet, wrapWithAmpersend } from '@ampersend_ai/ampersend-sdk'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import type { X402Treasurer, Authorization, PaymentContext, PaymentStatus } from '@ampersend_ai/ampersend-sdk'

export const CHAIN = baseSepolia
export const NETWORK = 'base-sepolia' as const

// NaiveTreasurer — auto-approves all x402 payments (ampersend-sdk pattern)
// NaiveTreasurer is not exported from the SDK package, so we implement the interface
class NaiveTreasurer implements X402Treasurer {
  constructor(private wallet: AccountWallet) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async onPaymentRequired(requirements: ReadonlyArray<any>, _context?: PaymentContext): Promise<Authorization | null> {
    const req = requirements[0]
    if (!req) return null
    const payment = await this.wallet.createPayment(req)
    return { payment, authorizationId: crypto.randomUUID() }
  }

  async onStatus(status: PaymentStatus, authorization: Authorization, _context?: PaymentContext): Promise<void> {
    console.log(`[Payment] ${status} — id: ${authorization.authorizationId}`)
  }
}

// Agent ports
export const PORTS = {
  dataAgent:     Number(process.env.DATA_AGENT_PORT)     || 3001,
  analysisAgent: Number(process.env.ANALYSIS_AGENT_PORT) || 3002,
  coordinator:   Number(process.env.COORDINATOR_PORT)    || 3000,
}

// Pricing (in USDC, 6 decimals)
export const PRICES = {
  dataAgent:     '$0.02',  // GitHub metrics lookup
  analysisAgent: '$0.05',  // Venice AI analysis
  coordinator:   '$0.08',  // Full analysis (earns $0.01 margin per query)
}

// Wallet from private key
export function getAgentWallet() {
  const pk = process.env.AGENT_PRIVATE_KEY as `0x${string}`
  if (!pk) throw new Error('AGENT_PRIVATE_KEY not set in .env')
  const account = privateKeyToAccount(pk)
  return { account, wallet: AccountWallet.fromPrivateKey(pk) }
}

// x402 fetch client that auto-pays 402 responses using ampersend-sdk
export function getPayingFetch(privateKey?: `0x${string}`) {
  const pk = privateKey ?? (process.env.AGENT_PRIVATE_KEY as `0x${string}`)
  if (!pk) throw new Error('No private key for paying fetch')
  const wallet = AccountWallet.fromPrivateKey(pk)
  const treasurer = new NaiveTreasurer(wallet)
  const client = wrapWithAmpersend(new x402Client(), treasurer, [NETWORK])
  return wrapFetchWithPayment(fetch, client as Parameters<typeof wrapFetchWithPayment>[1])
}

// USDC balance checker on Base Sepolia
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address // Base Sepolia USDC
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() })

export async function getUsdcBalance(address: Address): Promise<string> {
  try {
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
      functionName: 'balanceOf',
      args: [address],
    })
    return formatUnits(balance as bigint, 6)
  } catch {
    return '0.000000'
  }
}
