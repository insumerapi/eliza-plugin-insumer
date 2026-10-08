# @insumermodel/plugin-eliza

ElizaOS plugin for [InsumerAPI](https://insumermodel.com): 10 actions for condition-based access across 37 blockchains.

An agent can go from zero to running a condition-based commerce operation with no human involvement: provision an API key with USDC, create a merchant, configure which tokens gate access, add credits, verify wallets, run ACP/UCP commerce flows, and confirm payments, all autonomously.

## Install

```bash
npm install @insumermodel/plugin-eliza
```

Works with `@elizaos/core` 1.7 and later, and with 2.x. On a 2.0 pre-release (alpha or beta) build, npm does not match the peer range, so install with `npm install @insumermodel/plugin-eliza --legacy-peer-deps`.

## Configure

### 1. Get a key: no signup, no dashboard, no password

Two paths. Both return an `insr_live_...` key instantly with 10 free verifications plus 100 requests a day. One free key per email.

```bash
curl -s -X POST https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "appName": "ElizaOS Agent", "tier": "free"}' | jq .
```

Or enter your email on [insumermodel.com](https://insumermodel.com/?utm_source=npm-insumermodel-plugin-eliza) and the key appears inline. Already have a key? Manage it at [insumermodel.com/developers/account/](https://insumermodel.com/developers/account/?utm_source=npm-insumermodel-plugin-eliza).

### 2. Add to your character file

```json
{
  "plugins": ["@insumermodel/plugin-eliza"],
  "settings": {
    "secrets": {
      "INSUMER_API_KEY": "insr_live_your_key_here"
    }
  }
}
```

Or set the environment variable:

```bash
export INSUMER_API_KEY=insr_live_your_key_here
```

## Full Autonomous Flow

The 10 actions cover the complete agent lifecycle, with no human required at any step:

```
BUY_API_KEY          → Provision API key with USDC/USDT/BTC (no auth needed)
CREATE_MERCHANT      → Create merchant profile (codes draw on the owner key's credits)
CONFIGURE_TOKENS     → Set which tokens gate discounts + tier thresholds
ADD_CREDITS          → Add credits to the store owner's key with USDC
VERIFY_WALLET        → Verify token/NFT/attestation conditions (1-10 per call)
CHECK_TRUST          → Generate wallet trust profile (155 base checks across 27 chains, up to 176 across 29)
CHECK_TRUST_BATCH    → Profile up to 10 wallets in one call
ACP_DISCOUNT         → Check discount in OpenAI/Stripe ACP format
UCP_DISCOUNT         → Check discount in Google UCP format
CONFIRM_PAYMENT      → Confirm on-chain USDC payment for discount code
```

## Actions

### BUY_API_KEY

Buy a new InsumerAPI key with USDC, USDT, or BTC. No existing API key required: the sender wallet from the transaction becomes the key's identity. One key per wallet.

```
User: "I sent 10 USDC on Solana, tx 5Kx... Create an API key called TrustBot."
Agent: [calls BUY_API_KEY → POST /v1/keys/buy]

API key created successfully!
Key: insr_live_...
Name: TrustBot
Credits: 250
Wallet: <the paying Solana wallet>
```

On an EVM chain the paying wallet receives the Insumer Access pass by default and no key string is issued (the key is returned if the pass is deferred): the reply says which, and that wallet signs requests with an `Authorization: Wallet` header.

### CREATE_MERCHANT

Create a new merchant. The agent's API key owns the merchant, and discount codes draw on that key's credits.

```
User: "Create a merchant called Acme Coffee with ID acme-coffee in New York."
Agent: [calls CREATE_MERCHANT → POST /v1/merchants]

Merchant created successfully!
ID: acme-coffee
Name: Acme Coffee
Credits: the owner key's balance
```

### CONFIGURE_TOKENS

Configure which tokens gate access to merchant discounts. Up to 8 tokens with 1-4 discount tiers each. Supports EVM chains (Ethereum, Base, Polygon, Arbitrum, Optimism, and more) plus Solana and XRPL.

Only the tokens you name are sent. An own token you do not mention is left as stored. A partner list, when you give one, replaces the stored partner list, so name every partner token you want to keep. The own token is switched off, or the partner list emptied, only when you ask for that in so many words. Tier discounts are whole numbers from 1 to 50. An XRPL currency code is sent exactly as you wrote it: codes are case-sensitive.

```
User: "Set up USDC gating for acme-coffee: Bronze at 100 (5%), Silver at 1000 (10%), Gold at 10000 (15%) on Ethereum."
Agent: [calls CONFIGURE_TOKENS → PUT /v1/merchants/{id}/tokens]

Token tiers configured for acme-coffee!
Total tokens: 1/8
```

### ADD_CREDITS

Add credits to the API key that owns a store with USDC, USDT, or BTC (a store has no balance of its own). Discount codes that carry a discount draw on those credits.

```
User: "I sent 20 USDC on Base (tx 0xabc123) to top up credits for acme-coffee."
Agent: [calls ADD_CREDITS → POST /v1/merchants/{id}/credits]

Credits added to acme-coffee!
Credits added: 500
Total credits: 600
USDC paid: 20
Chain: Base
```

### VERIFY_WALLET

Verify 1-10 on-chain conditions (token balances, NFT ownership, EAS attestations, Farcaster identity, `evm_view_call` boolean view functions, `ratio_to_amount` for self-scaling agent-spend limits and `ratio_to_supply` for share-of-supply rules (all three EVM only), `erc8004_agent` and `erc7710_delegation` agent-standing checks on Base, plus `account_code`, the code state of the wallet address itself on any EVM chain) across 37 chains. Returns ECDSA-signed boolean results.

```
User: "Check if 0xd8dA... holds at least 100 UNI"
Agent: [calls VERIFY_WALLET → POST /v1/attest]

Attestation ATST-A7C3E1B2D4F56789: PASS
  [+] UNI balance >= 100 (chain 1)
1 passed, 0 failed
```

`account_code` takes `chainId` (an EVM chain) and `expect`: `"none"` (no code, a plain key account), `"eip7702"` (the EIP-7702 delegation designator, a key that has delegated execution to a contract) or `"contract"` (any other code: a smart-contract wallet, a protocol, a token). With `expect: "eip7702"`, an optional `delegate` address is met only when the designator points at it. The result is the boolean `met`; the code and the delegation target are never returned. The request the agent sends for "has vitalik.eth delegated with EIP-7702 on Base":

```json
{ "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "conditions": [{ "type": "account_code", "chainId": 8453, "expect": "eip7702" }] }
```

### CHECK_TRUST

Generate a structured wallet trust profile: 155 base checks across 27 chains in 10 dimensions (stablecoins, governance tokens, NFTs, staking, institutional stablecoins, tokenized treasuries, stablecoin deposits, wrapped bitcoin, names, account), up to 176 checks across 29 chains in 14 dimensions with optional Solana, XRPL, Bitcoin, and Tron wallets. Stellar and Sui wallets switch on rows inside the base dimensions. Every check is a presence check; the signed `conditionSetVersion` (currently `2026-10-08`) names the check list that was run. The `account` dimension has two rows per chain on Ethereum, Base, Arbitrum, Optimism and Polygon: "Contract code on X" and "EIP-7702 delegation on X". A plain key reads false on both; which contract is there is never named.

```
User: "What's the trust profile for 0x1601...?"
Agent: [calls CHECK_TRUST → POST /v1/trust]

Trust Profile TRST-81224
  stablecoins: 6/52 passed
  governance: 0/8 passed
  nfts: 0/3 passed
  staking: 0/5 passed
  institutional_stablecoins: 0/8 passed, 6 not evaluated
  tokenized_treasuries: 0/16 passed, 1 not evaluated
  stablecoin_deposits: 5/39 passed
  wrapped_bitcoin: 0/12 passed
  names: 0/2 passed
  account: 5/10 passed
Overall: 16/155 checks passed (11 assets held, 5 account facts present)
7 of 155 checks were not evaluated: no wallet was supplied for their chain. Supply solanaWallet, stellarWallet, suiWallet, xrplWallet to run them.
```

The reply is one line per dimension, in a fixed order: the base dimensions as listed above, then `solana`, `xrpl`, `bitcoin` and `tron` when their wallet was supplied. The individual checks are in the action result's `data`. A check whose chain needs a wallet that was not supplied is counted as not evaluated, never as failed.

### CHECK_TRUST_BATCH

Profile up to 10 wallets in a single request. Faster than sequential calls.

```
User: "Check trust for these wallets: 0x1601... (Solana wallet DXK4...), 0xBBBB..., 0xB561..."
Agent: [calls CHECK_TRUST_BATCH → POST /v1/trust/batch]

Batch Trust: 3 profiles
  0x1601...: 17/169 checks passed, 5 account facts (TRST-74167)
  0xBBBB...: 30/155 checks passed, 2 account facts (TRST-C7EA2)
  0xB561...: 5/155 checks passed, 0 account facts (TRST-CFD45)

3/3 succeeded
```

The first wallet supplied a Solana wallet, so its profile carries the `solana` dimension (14 more checks); the other two ran the 155 base checks.

### ACP_DISCOUNT

Check discount eligibility in OpenAI/Stripe Agentic Commerce Protocol format. Returns coupon objects, allocations, and a signed verification code. Costs 1 credit from the API key that owns the store (a 0% result is free).

```
User: "Check ACP discount for 0xd8dA... at merchant acme-coffee."
Agent: [calls ACP_DISCOUNT → POST /v1/acp/discount]

ACP Discount Result
Verification code: INSR-A7K3M
Discount: 10%
```

### UCP_DISCOUNT

Check discount eligibility in Google Universal Commerce Protocol format. Returns title-based discounts and a signed verification code. Costs 1 credit from the API key that owns the store (a 0% result is free).

```
User: "Check UCP discount for 0xd8dA... at merchant acme-coffee."
Agent: [calls UCP_DISCOUNT → POST /v1/ucp/discount]

UCP Discount Result
Verification code: INSR-B8L4N
Discount: 10%
```

### CONFIRM_PAYMENT

Confirm that a USDC payment was made on-chain for a discount code. Verifies the transaction receipt to ensure USDC arrived at the merchant address.

```
User: "Confirm payment for code INSR-A7K3M. I sent 25 USDC on Base, tx 0xdef456."
Agent: [calls CONFIRM_PAYMENT → POST /v1/payment/confirm]

Payment confirmed!
Code: INSR-A7K3M
Amount verified: 25 USDC
Chain: Base
```

## Wallet Auth (JWT)

The VERIFY_WALLET action supports `format: "jwt"` when the user requests a JWT or bearer token. The response includes a standard ES256-signed JWT alongside the attestation, verifiable by any JWT library via the JWKS endpoint at `GET /v1/jwks`, and beside it a `pqJwt` sibling (a compact JWS with `alg` ML-DSA-65 carrying the same claims). Use the `jwt` for direct API gateway integration (Kong, Nginx, Cloudflare Access, AWS API Gateway).

## Signed responses

VERIFY_WALLET, CHECK_TRUST, and CHECK_TRUST_BATCH return the full API envelope in the action result's `data`. The callback text summarises pass/fail; the signature travels in `data`:

```json
{
  "attestation": { "id": "ATST-A7C3E1B2D4F56789", "pass": true, "results": [ ... ], "attestedAt": "2026-09-02T12:34:57.000Z", "expiresAt": "2026-09-02T13:04:57.000Z" },
  "sig": "NgA7BO8SAildiTrgIQY2UyXsBrySZknkP85pT2Zqv8Hq0KsCsB8DRFVMkXgnXtCXrbb726Is6k4LyyBYU+f/Pw==",
  "kid": "insumer-attest-v2",
  "pqSig": "<base64 ML-DSA-65 signature>",
  "pqKid": "insumer-attest-pq1"
}
```

`sig` is an ECDSA P-256 signature (base64, P1363 r||s) and `kid` selects the signed preimage (`insumer-attest-v2` signs the domain-tagged canonical JSON; `insumer-attest-v1` signs bare insertion-order JSON). Every attest and trust response is signed twice: ES256 and a post-quantum ML-DSA-65 signature, `pqSig` and `pqKid` (trust profiles use `insumer-trust-pq1`), carried beside `sig` and `kid` without changing them. The JWKS at `https://insumermodel.com/.well-known/jwks.json` holds five entries over two keys: the EC key under three kids, then the post-quantum key under two RFC 9964 `AKP` entries. Match by `kid` or `pqKid`, never by position. `npm install insumer-verify` (1.8.1+) verifies the envelope and reports five verdicts: signature, condition hash, freshness, expiry, and the post-quantum signature. The `insumer-verify` package runs every check; it is on npm for Node and on PyPI for Python under the same name.

## Provider: WALLET_CREDENTIALS

Automatically detects wallet addresses (EVM, Solana, XRPL, Bitcoin, Tron, Stellar, Sui) in conversation and signals that verification actions are available. Dynamic: only activates when wallet patterns are found.

## Handling `rpc_failure` Errors

If the API cannot read one or more data sources after retries, it answers with HTTP 503 and error code `rpc_failure`. VERIFY_WALLET, CHECK_TRUST, ACP_DISCOUNT and UCP_DISCOUNT can all meet it. The action then returns `success: false`, the API's message as `text`, and `data: { code: "rpc_failure", retryable: true, failedConditions: [...] }`. No signature, no JWT, no discount code, no credits charged. This is a retryable error: the agent should retry after 2-5 seconds.

Every other API error is returned the same way, with the API's numeric status as `data.code` (for example `400`) and `retryable: false`. A 400 names what to change in the request.

CHECK_TRUST_BATCH is the exception: one wallet that could not be read does not fail the batch. That wallet's line reads `ERROR` with a message that starts `rpc_failure:`, and the other profiles are returned. Retry that wallet alone.

**Important:** `rpc_failure` is NOT a verification failure. Do not treat it as `pass: false`. It means the data source was temporarily unavailable and the API refused to sign an unverified result.

## Supported Chains (37)

31 EVM chains + Solana + XRP Ledger + Bitcoin + Tron + Stellar + Sui. Includes Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche, XDC, Robinhood Chain, Arc, and 21 more EVM chains. [Full list →](https://insumermodel.com/developers/api-reference/)

## Pricing

**Tiers:** Free (10 free verifications plus 100 requests a day) | Pro $29/mo (1,000 credits/mo, 10,000/day) | Enterprise $99/mo (5,000 credits/mo, 100,000/day)

**Volume discounts:** $5–$99 = $0.04/call (25 credits/$1) · $100–$499 = $0.03 (33/$1, 25% off) · $500+ = $0.02 (50/$1, 50% off)

**Platform wallets:**
- **EVM (USDC/USDT):** `0xAd982CB19aCCa2923Df8F687C0614a7700255a23`
- **Solana (USDC/USDT):** `6a1mLjefhvSJX1sEX8PTnionbE9DqoYjU6F6bNkT4Ydr`
- **Bitcoin:** `bc1qg7qnerdhlmdn899zemtez5tcx2a2snc0dt9dt0`
- **Tron (USDT-TRC20):** `TC5yvwkAMakkXtUxYiu2Yn1xbBcwYuD6cn`

**Supported payment chains:** Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche, Solana, Bitcoin, Tron (USDT-TRC20). Tokens sent on unsupported chains cannot be recovered. All purchases are final and non-refundable. [Full pricing →](https://insumermodel.com/pricing/)

## Also Available As

- **Claude Code Skill:** `smithery skill add douglasborthwick/insumer-skill` ([Smithery](https://smithery.ai/skills/douglasborthwick/insumer-skill) · [GitHub](https://github.com/insumerapi/insumer-skill)), for *writing* wallet auth into your own projects from inside Claude Code
- **MCP Server:** `npx -y mcp-server-insumer` ([npm](https://www.npmjs.com/package/mcp-server-insumer)), for runtime agent access to the API
- **LangChain:** `pip install langchain-insumer` ([PyPI](https://pypi.org/project/langchain-insumer/))
- **OpenAI GPT:** [InsumerAPI Wallet Auth](https://chatgpt.com/g/g-699c5e43ce2481918b3f1e7f144c8a49-insumerapi-wallet-auth) (GPT Store)

## Other ways to reach the same API

**Hosted MCP.** `https://api.insumermodel.com/mcp` speaks MCP streamable HTTP. Connect by URL from ChatGPT, claude.ai or any hosted agent: no install, no key. It serves ten tools on a shared daily allowance: `insumer_attest`, `insumer_wallet_trust`, `insumer_batch_wallet_trust`, `insumer_compliance_templates`, `insumer_jwks`, `insumer_list_merchants`, `insumer_get_merchant`, `insumer_list_tokens`, `insumer_check_discount` and `insumer_validate_code`. It does not issue ACP/UCP discounts or set up merchants. For all 27 tools on your own key, run `npx -y mcp-server-insumer`.

**x402 pay-per-call.** An agent that holds a wallet can pay per call instead of holding a key. `POST /v1/attest`, `/v1/trust` and `/v1/trust/batch` accept x402: call with no credential headers, receive `402` with a quote (`x402Version` 2), pay in USDC on Base, Polygon, Arbitrum, Solana or Arc, and retry with the `PAYMENT-SIGNATURE` header. Prices: attest $0.05 ($0.10 with a Merkle proof), trust $0.15 per wallet ($0.30), trust/batch $0.15 per wallet ($0.30). The discount endpoints (`/v1/verify`, `/v1/acp/discount`, `/v1/ucp/discount`) do not take x402. x402 moves the money. InsumerAPI checks the conditions. The payer is charged only for a successful answer, and the payer sees the answer only after the payment settled.

## Links

- [API Documentation](https://insumermodel.com/developers/api-reference/)
- [OpenAPI Spec](https://insumermodel.com/openapi.yaml)
- [API Topology](https://insumermodel.com/workbench/)

## License

MIT

---
