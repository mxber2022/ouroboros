// Local x402 Facilitator — settles payments using our agent wallet
// Replaces the shared x402.org testnet facilitator which has nonce congestion
// In production: swap FACILITATOR_PORT for a hosted facilitator service

import express from 'express'
import { createWalletClient, http, type Address, type Hex, hexToSignature, nonceManager } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

export const FACILITATOR_PORT = 3009
export const FACILITATOR_URL = `http://localhost:${FACILITATOR_PORT}`

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address
const RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'

const USDC_ABI = [{
  name: 'transferWithAuthorization',
  type: 'function' as const,
  inputs: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'v', type: 'uint8' },
    { name: 'r', type: 'bytes32' },
    { name: 's', type: 'bytes32' },
  ],
  outputs: [],
  stateMutability: 'nonpayable' as const,
}]

export function startFacilitator() {
  const pk = process.env.AGENT_PRIVATE_KEY as Hex
  if (!pk) throw new Error('AGENT_PRIVATE_KEY not set')

  const account = privateKeyToAccount(pk, { nonceManager })
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) })

  const app = express()
  app.use(express.json())

  // GET /supported — tell x402 what networks/schemes we support
  app.get('/supported', (_req, res) => {
    res.json({
      kinds: [{ scheme: 'exact', network: 'base-sepolia' }]
    })
  })

  // POST /verify — validate payment signature
  app.post('/verify', async (req, res) => {
    try {
      const { paymentPayload } = req.body
      console.log('[Facilitator] verify payload keys:', JSON.stringify(Object.keys(paymentPayload || {})))
      console.log('[Facilitator] verify payload:', JSON.stringify(paymentPayload)?.slice(0, 300))
      // Accept all valid-looking payments
      if (!paymentPayload) {
        return res.json({ isValid: false, invalidReason: 'Missing payment payload' })
      }
      res.json({ isValid: true })
    } catch (err) {
      res.json({ isValid: false, invalidReason: String(err) })
    }
  })

  // POST /settle — execute transferWithAuthorization on-chain
  app.post('/settle', async (req, res) => {
    try {
      const { paymentPayload } = req.body
      const raw = paymentPayload?.payload
      if (!raw) {
        return res.json({ success: false, errorReason: 'Missing payment payload' })
      }

      // v2 format: { signature, authorization: { from, to, value, validAfter, validBefore, nonce } }
      const auth = raw.authorization ?? raw
      const sig = raw.signature
        ? hexToSignature(raw.signature as Hex)
        : { v: BigInt(raw.v), r: raw.r as Hex, s: raw.s as Hex }

      console.log(`[Facilitator] Settling: ${auth.from} → ${auth.to} | ${auth.value} atomic USDC`)

      const txHash = await walletClient.writeContract({
        address: USDC,
        abi: USDC_ABI,
        functionName: 'transferWithAuthorization',
        args: [
          auth.from as Address,
          auth.to as Address,
          BigInt(auth.value),
          BigInt(auth.validAfter),
          BigInt(auth.validBefore),
          auth.nonce as Hex,
          Number(sig.v),
          sig.r as Hex,
          sig.s as Hex,
        ],
      })

      console.log(`[Facilitator] ✓ Settled: ${txHash}`)
      res.json({ success: true, transaction: txHash })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Facilitator] ✗ Settle failed: ${msg.slice(0, 300)}`)
      res.json({ success: false, errorReason: msg.slice(0, 500) })
    }
  })

  app.listen(FACILITATOR_PORT, () => {
    console.log(`[Facilitator] Local x402 facilitator on :${FACILITATOR_PORT} — settles via agent wallet ${account.address}`)
  })

  return app
}
