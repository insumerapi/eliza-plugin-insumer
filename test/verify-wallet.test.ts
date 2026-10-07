/**
 * Tests for VERIFY_WALLET action JWT format support and response formatting.
 *
 * Run: npx vitest run
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatAttestResult, formatTrustResult, formatBatchResult, errorData, orderDimensions } from "../src/utils/api.js";
import { buildTokensBody } from "../src/actions/configure_tokens.js";
import type { AttestParams } from "../src/utils/api.js";

// --- formatAttestResult tests ---

describe("formatAttestResult", () => {
  it("formats standard attest response correctly", () => {
    const data = {
      attestation: {
        id: "ATST-A7C3E1B2D4F56789",
        pass: false,
        results: [
          { condition: 0, label: "USDC >= 1000", type: "token_balance", chainId: 1, met: true },
          { condition: 1, label: "Bored Ape holder", type: "nft_ownership", chainId: 1, met: false },
        ],
        passCount: 1,
        failCount: 1,
        attestedAt: "2026-03-04T12:00:00.000Z",
        expiresAt: "2026-03-04T12:30:00.000Z",
      },
      sig: "base64sig...",
      kid: "insumer-attest-v1",
    };

    const result = formatAttestResult(data);
    expect(result).toContain("Attestation ATST-A7C3E1B2D4F56789: FAIL");
    expect(result).toContain("[+] USDC >= 1000 (chain 1)");
    expect(result).toContain("[-] Bored Ape holder (chain 1)");
    expect(result).toContain("1 passed, 1 failed");
    expect(result).toContain("Expires: 2026-03-04T12:30:00.000Z");
    expect(result).not.toContain("JWT:");
  });

  it("includes jwt field when present", () => {
    const data = {
      attestation: {
        id: "ATST-B8D4F6A7E9C01234",
        pass: true,
        results: [{ condition: 0, label: "Test", type: "token_balance", chainId: 1, met: true }],
        passCount: 1,
        failCount: 0,
        attestedAt: "2026-03-04T12:00:00.000Z",
        expiresAt: "2026-03-04T12:30:00.000Z",
      },
      sig: "base64sig...",
      kid: "insumer-attest-v1",
      jwt: "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIweDEyMzQifQ.dGVzdA",
    };

    const result = formatAttestResult(data);
    expect(result).toContain("Attestation ATST-B8D4F6A7E9C01234: PASS");
    expect(result).toContain("JWT: eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIweDEyMzQifQ.dGVzdA");
  });
});

// --- formatTrustResult tests ---

describe("formatTrustResult", () => {
  it("formats trust response with correct nesting", () => {
    const data = {
      trust: {
        id: "TRST-12345",
        wallet: "0xabc",
        dimensions: {
          financial: {
            checks: [
              { label: "USDC balance", met: true },
              { label: "ETH balance", met: false },
            ],
            passCount: 1,
            failCount: 1,
            total: 2,
          },
        },
        summary: {
          totalChecks: 2,
          totalPassed: 1,
          totalFailed: 1,
        },
      },
      sig: "base64sig...",
      kid: "insumer-attest-v1",
    };

    const result = formatTrustResult(data);
    expect(result).toContain("Trust Profile TRST-12345");
    expect(result).toContain("financial: 1/2 passed");
    expect(result).toContain("Overall: 1/2 checks passed");
    // One line per dimension: the checks themselves are not listed.
    expect(result).not.toContain("USDC balance");
    expect(result).not.toContain("not evaluated");
  });

  it("counts checks that were not evaluated on their own, never as failed", () => {
    const data = {
      trust: {
        id: "TRST-67890",
        wallet: "0xabc",
        conditionSetVersion: "2026-10-08",
        dimensions: {
          institutional_stablecoins: {
            checks: [
              { label: "USDC on Ethereum", met: true },
              { label: "USDC on Stellar", met: false, evaluated: false, reason: "wallet_not_provided", requires: "stellarWallet" },
              { label: "USDC on Sui", met: false, evaluated: false, reason: "wallet_not_provided", requires: "suiWallet" },
            ],
            passCount: 1,
            failCount: 0,
            notEvaluatedCount: 2,
            total: 3,
          },
          account: {
            checks: [
              {
                label: "Contract code on Ethereum",
                chainId: 1,
                met: true,
                evaluatedCondition: { type: "account_code", chainId: 1, expect: "contract", operator: "code_state" },
              },
              {
                label: "EIP-7702 delegation on Ethereum",
                chainId: 1,
                met: false,
                evaluatedCondition: { type: "account_code", chainId: 1, expect: "eip7702", operator: "code_state" },
              },
            ],
            passCount: 1,
            failCount: 1,
            notEvaluatedCount: 0,
            total: 2,
          },
        },
        summary: { totalChecks: 5, totalPassed: 2, totalFailed: 1, totalNotEvaluated: 2 },
      },
      sig: "base64sig...",
      kid: "insumer-trust-v2",
    };

    const result = formatTrustResult(data);
    expect(result).toContain("institutional_stablecoins: 1/3 passed, 2 not evaluated");
    expect(result).toContain("account: 1/2 passed");
    expect(result).not.toContain("account: 1/2 passed,");
    expect(result).toContain("Overall: 2/5 checks passed");
    expect(result).toContain("2 of 5 checks were not evaluated");
    expect(result).toContain("Supply stellarWallet, suiWallet to run them.");
    expect(result).not.toContain("[-]");
  });

  it("prints dimensions in the fixed order whatever order the object arrived in", () => {
    const dim = { checks: [], passCount: 0, failCount: 0, total: 1 };
    const data = {
      trust: {
        id: "TRST-ORDER",
        wallet: "0xabc",
        conditionSetVersion: "2026-10-08",
        dimensions: {
          zeta_future: dim,
          tron: dim,
          account: dim,
          solana: dim,
          names: dim,
          alpha_future: dim,
          stablecoins: dim,
          xrpl: dim,
          wrapped_bitcoin: dim,
          governance: dim,
          bitcoin: dim,
          stablecoin_deposits: dim,
          nfts: dim,
          tokenized_treasuries: dim,
          staking: dim,
          institutional_stablecoins: dim,
        },
        summary: { totalChecks: 16, totalPassed: 0, totalFailed: 16 },
      },
      sig: "base64sig...",
      kid: "insumer-trust-v2",
    };

    const names = formatTrustResult(data)
      .split("\n")
      .filter((l) => l.startsWith("  "))
      .map((l) => l.trim().split(":")[0]);
    expect(names).toEqual([
      "stablecoins",
      "governance",
      "nfts",
      "staking",
      "institutional_stablecoins",
      "tokenized_treasuries",
      "stablecoin_deposits",
      "wrapped_bitcoin",
      "names",
      "account",
      "solana",
      "xrpl",
      "bitcoin",
      "tron",
      "alpha_future",
      "zeta_future",
    ]);
    // A base-only profile prints the ten base dimensions and nothing else.
    expect(orderDimensions({ account: 1, stablecoins: 2 }).map(([n]) => n)).toEqual(["stablecoins", "account"]);
  });
});

// --- errorData tests ---

describe("errorData", () => {
  it("carries rpc_failure and failedConditions, marked retryable", () => {
    const out = errorData({
      ok: false,
      error: {
        code: "rpc_failure",
        message: "Unable to verify all conditions",
        failedConditions: [{ source: "balance_read", chainId: 1, message: "Timeout" }],
      },
    });
    expect(out.code).toBe("rpc_failure");
    expect(out.retryable).toBe(true);
    expect(out.failedConditions).toEqual([{ source: "balance_read", chainId: 1, message: "Timeout" }]);
  });

  it("carries a 400 as not retryable", () => {
    const out = errorData({ ok: false, error: { code: 400, message: "currency is required" } });
    expect(out.code).toBe(400);
    expect(out.retryable).toBe(false);
    expect(out.failedConditions).toBeUndefined();
  });
});

// --- buildTokensBody tests ---

describe("buildTokensBody", () => {
  const token = {
    symbol: "RLUSD",
    chainId: "xrpl" as const,
    contractAddress: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
    decimals: 6,
    currency: "RLUSD",
    tiers: [{ name: "Gold", threshold: 100, discount: 10 }],
  };

  it("drops a null own token and an empty partner list the user did not ask for", () => {
    expect(buildTokensBody({ merchantId: "m", ownToken: null, partnerTokens: [token] })).toEqual({ partnerTokens: [token] });
    expect(buildTokensBody({ merchantId: "m", ownToken: token, partnerTokens: [] })).toEqual({ ownToken: token });
    expect(buildTokensBody({ merchantId: "m", ownToken: null, partnerTokens: [] })).toEqual({});
  });

  it("sends a removal only when it was asked for", () => {
    expect(buildTokensBody({ merchantId: "m", disableOwnToken: true })).toEqual({ ownToken: null });
    expect(buildTokensBody({ merchantId: "m", clearPartnerTokens: true })).toEqual({ partnerTokens: [] });
  });

  it("leaves the currency code exactly as given", () => {
    const body = buildTokensBody({ merchantId: "m", ownToken: { ...token, currency: "rlUSD" } });
    expect((body.ownToken as { currency: string }).currency).toBe("rlUSD");
  });
});

// --- formatBatchResult tests ---

describe("formatBatchResult", () => {
  it("formats batch response with correct nesting", () => {
    const data = {
      results: [
        {
          trust: {
            id: "TRST-AAA",
            wallet: "0x111",
            summary: { totalChecks: 5, totalPassed: 3, totalFailed: 2 },
          },
          sig: "sig1",
          kid: "insumer-attest-v1",
        },
        {
          error: { wallet: "0x222", message: "Invalid address" },
        },
      ],
      summary: { requested: 2, succeeded: 1, failed: 1 },
    };

    const result = formatBatchResult(data);
    expect(result).toContain("Batch Trust: 2 profiles");
    expect(result).toContain("0x111: 3/5 checks passed (TRST-AAA)");
    expect(result).toContain("0x222: ERROR — Invalid address");
    expect(result).toContain("1/2 succeeded");
  });
});

// --- AttestParams type tests ---

describe("AttestParams", () => {
  it("accepts format: 'jwt'", () => {
    const params: AttestParams = {
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      format: "jwt",
      conditions: [
        { type: "token_balance", contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chainId: 1, threshold: 100, decimals: 6 },
      ],
    };
    expect(params.format).toBe("jwt");
  });

  it("format is optional (undefined by default)", () => {
    const params: AttestParams = {
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      conditions: [{ type: "token_balance", contractAddress: "0x...", chainId: 1, threshold: 1 }],
    };
    expect(params.format).toBeUndefined();
  });

  it("accepts an account_code condition with expect and delegate", () => {
    const params: AttestParams = {
      wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      conditions: [
        { type: "account_code", chainId: 8453, expect: "eip7702" },
        { type: "account_code", chainId: 1, expect: "eip7702", delegate: "0x1234567890abcdef1234567890abcdef12345678" },
        { type: "account_code", chainId: 10, expect: "none" },
      ],
    };
    expect(params.conditions[0].expect).toBe("eip7702");
    expect(params.conditions[1].delegate).toBeDefined();
    expect(params.conditions[2].expect).toBe("none");
  });
});

// --- apiCall format passthrough test ---

describe("apiCall format passthrough", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes format in request body when set to jwt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          data: {
            attestation: { id: "ATST-TEST", pass: true, results: [], passCount: 0, failCount: 0 },
            sig: "sig",
            kid: "insumer-attest-v1",
            jwt: "eyJ.eyJ.sig",
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiCall } = await import("../src/utils/api.js");
    await apiCall("insr_live_test", "POST", "/attest", {
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      format: "jwt",
      conditions: [{ type: "token_balance", contractAddress: "0x...", chainId: 1, threshold: 1 }],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.format).toBe("jwt");
  });

  it("does not include format when not set", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          data: {
            attestation: { id: "ATST-TEST", pass: true, results: [], passCount: 0, failCount: 0 },
            sig: "sig",
            kid: "insumer-attest-v1",
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiCall } = await import("../src/utils/api.js");
    await apiCall("insr_live_test", "POST", "/attest", {
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      conditions: [{ type: "token_balance", contractAddress: "0x...", chainId: 1, threshold: 1 }],
    });

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.format).toBeUndefined();
  });
});
