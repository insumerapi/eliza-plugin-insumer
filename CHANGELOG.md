# Changelog

## 2.4.2 (2026-10-07)

- CHECK_TRUST_BATCH, the condition type comments and the extraction template state what a caller observes: a batch is faster than sequential calls, and `evm_view_call`, `ratio_to_amount` and `ratio_to_supply` run on EVM chains (`ratio_to_supply` on ERC-20 tokens). No action, input or output changes.

## 2.4.1 (2026-10-07)

- CHECK_TRUST and CHECK_TRUST_BATCH keep asset rows and account rows apart in their totals: "Overall: 16/155 checks passed (11 assets held, 5 account facts present)" and "17/169 checks passed, 5 account facts". The account facts are counted beside the assets, never added to them.

## 2.4.0 (2026-10-07)

- Adds the `account_code` condition type to VERIFY_WALLET, the tenth type: `{ type: "account_code", chainId: <EVM id>, expect: "none" | "eip7702" | "contract" }` checks the code state of the wallet address itself at the anchored block (a plain key account, the EIP-7702 delegation designator, or any other code). An optional `delegate` with `expect: "eip7702"` is met only when the designator points at that address. The result is the boolean `met`; the code and the delegation target are never returned. EVM chains only; 1 credit; 30-minute expiry; `format: "jwt"` works. The `AttestCondition` type and the extraction prompt carry `expect` and `delegate` with these semantics.
- Adds the `account` dimension to CHECK_TRUST and CHECK_TRUST_BATCH, already live on `/v1/trust` and `/v1/trust/batch`: two rows per chain, "Contract code on X" and "EIP-7702 delegation on X", on Ethereum, Base, Arbitrum, Optimism and Polygon. Counts move to 155 base checks across 27 chains in 10 dimensions, up to 176 across 29 chains in 14 with the optional Solana, XRPL, Bitcoin and Tron wallets; `conditionSetVersion` is `2026-10-08`. The action description, the extraction template, the package description and the README example outputs (now from a real response) follow.
- Enhances the CHECK_TRUST reply: dimensions print in the API's fixed order (the base dimensions, then solana, xrpl, bitcoin, tron when switched on), so two profiles read the same way line for line. Covered by a test.

## 2.3.8 (2026-10-05)

- CONFIGURE_TOKENS no longer sends `ownToken: null` or `partnerTokens: []` unless the user asked for the removal. Before, a request that named only partner tokens could switch the merchant's own token off, and a request that named only the own token could empty the partner list. A key the user did not mention is now left out of the request, and the prompt says so. If nothing is left to send, the action asks what to configure and makes no call.
- A failed action now returns `data: { code, retryable, failedConditions }` beside the message, so a caller can tell a retryable `rpc_failure` (HTTP 503) from a 400 without reading the sentence. The README section on `rpc_failure` describes what is returned, names ACP_DISCOUNT and UCP_DISCOUNT among the actions that can meet it, and explains the per-wallet error entries of CHECK_TRUST_BATCH.
- CHECK_TRUST replies with one line per dimension instead of one line per check (a profile is 145 to 166 checks). Checks whose wallet was not supplied are counted as not evaluated and are no longer shown as failed.
- Prompts: an XRPL `currency` code is case-sensitive and is copied exactly as written; `XRP` is not a trust line currency; tier discounts are whole numbers from 1 to 50; `taxon` is a whole number from 0 to 4294967295.
- ACP_DISCOUNT and UCP_DISCOUNT no longer offer Bitcoin, Tron, Stellar or Sui wallets. Merchant discounts read EVM, Solana and XRPL wallets only.

## 2.3.7 (2026-10-01)

- elizaOS 2.x: the peer range is now `^1.7.0 || ^2.0.0`, so the plugin installs beside a 2.x core instead of failing npm's peer check. On a 2.0 pre-release build, install with `--legacy-peer-deps`; the README says so.
- Each action now types its result `data` as the core's own `ActionResult["data"]`, so the source type-checks against both 1.7 and 2.x (2.x narrowed that field, which raised one error per action). Types only: the built JavaScript is unchanged.
- Verified live against both `@elizaos/core` 1.7.2 and 2.0.11-beta.7: all ten actions register, and VERIFY_WALLET and CHECK_TRUST return signed attestations and trust profiles with their post-quantum companions.

## 2.3.6 (2026-10-01)

- Trust text follows the 2026-10-01 condition-set expansion, already live on `/v1/trust` and `/v1/trust/batch`: 145 base checks across 27 chains in 9 dimensions (adds tokenized_treasuries, stablecoin_deposits, wrapped_bitcoin and names), up to 166 across 29 chains in 13 with the optional Solana, XRPL, Bitcoin and Tron wallets. Stellar and Sui wallets add no dimension; their rows sit inside the base dimensions. The CHECK_TRUST action description, the extraction template, the package description and the README (including the schematic example outputs, now out of 145 with the four new dimension rows) updated; no code path changed.

## 2.3.5 (2026-09-21)

- The token-configuration prompt lists all 31 EVM chains the merchant registry accepts (adds Taiko, Ronin, Viction and Arc), says Bitcoin, Tron, Stellar and Sui are not available there, and marks `decimals` as required.
- README: the CHECK_TRUST example output shows all five base dimensions and adds up to 45.

## 2.3.4 (2026-09-21)

- Aligns the trust profile counts with the engine as of 2026-09-21, when USDC on Arc became a trust check: 45 base checks across 26 chains in 5 dimensions (was 44 across 25), up to 50 across 28 chains in 9 dimensions with the optional wallets (was 49 across 27). The README example outputs read out of 45.

## 2.3.3 (2026-09-20)

- Aligns chain counts with the engine: 37 chains, 31 EVM; NFT ownership on 33. The chain ID reference adds Arc (5042).
- Removes Moonbeam and Moonriver, which the engine retired on 2026-09-20, from the verification and onboarding chain references.
- Updates the verification prompt so the model leaves `decimals` out: the token's own decimals are always read from the chain, and a value that differs is rejected with a 400. The handler also drops a `decimals` field if the model emits one.
- Clarifies `contractAddress`: `native` is for `token_balance` and `ratio_to_amount` only, `nft_ownership` needs the NFT contract address, and native SUI is `0x2::sui::SUI`.
- Updates the trust profile wording: 44 base checks across 25 chains in 5 dimensions, up to 49 across 27 chains with optional wallets.

## 2.3.2 (2026-09-02)

- Adds a "Signed responses" section to the README: the action result's `data` carries `sig`, `kid`, and since 2026-09-01 the ML-DSA-65 post-quantum companion `pqSig`/`pqKid` (with `pqJwt` beside `jwt`); the JWKS holds five entries over two keys; `insumer-verify` 1.8.1+ reports five verdicts.
- Enhances the chain summary to 32 EVM chains (38 total), naming Robinhood Chain.
