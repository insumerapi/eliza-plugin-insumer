# Changelog

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
