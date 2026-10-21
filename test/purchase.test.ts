/**
 * Tests for BUY_API_KEY and ADD_CREDITS: USDC-only purchases and the sender signature.
 * fetch is mocked: no request leaves the test.
 *
 * Run: npx vitest run
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { senderProofText, senderProofReply, purchaseBody } from "../src/utils/api.js";
import type { ApiResponse } from "../src/utils/api.js";
import { buyKeyAction } from "../src/actions/buy_key.js";
import { addCreditsAction } from "../src/actions/add_credits.js";

const TEXT = [
  "api.insumermodel.com",
  "Confirm the wallet that sent this payment.",
  "Purpose: key purchase",
  "Chain: eip155:8453",
  "Transaction: 0x" + "ab".repeat(32),
].join("\n");

function missing(text: string): ApiResponse {
  return {
    ok: false,
    error: {
      code: 400,
      message:
        "senderSignature is required: sign this exact text with the wallet that sent the payment, and send the signature as senderSignature.\n\n" +
        text,
    },
  };
}

function runtimeReturning(params: Record<string, unknown>) {
  return {
    getSetting: (k: string) => (k === "INSUMER_API_KEY" ? "insr_live_test" : undefined),
    composeState: async () => ({ text: "" }),
    useModel: async () => JSON.stringify(params),
  } as never;
}

const message = { content: { text: "" } } as never;

describe("senderProofText", () => {
  it("returns the exact text from a missing-signature 400", () => {
    expect(senderProofText(missing(TEXT))).toBe(TEXT);
  });

  it("returns the exact text from a mismatch 403", () => {
    const r: ApiResponse = {
      ok: false,
      error: {
        code: 403,
        message: "senderSignature does not match the wallet that sent the payment. Sign this exact text with that wallet:\n\n" + TEXT,
      },
    };
    expect(senderProofText(r)).toBe(TEXT);
  });

  it("is null for any other error", () => {
    expect(senderProofText({ ok: false, error: { code: 400, message: "Key and credit purchases are paid in USDC only." } })).toBeNull();
    expect(senderProofText({ ok: true, data: {} })).toBeNull();
  });
});

describe("senderProofReply", () => {
  it("carries the text unchanged and how to sign it", () => {
    const reply = senderProofReply(TEXT, false);
    expect(reply).toContain(TEXT);
    expect(reply).toContain("personal_sign");
    expect(reply).toContain("signMessage");
    expect(reply).not.toContain("does not match");
  });

  it("says when the signature did not match", () => {
    expect(senderProofReply(TEXT, true)).toContain("does not match");
  });
});

describe("purchaseBody", () => {
  it("drops empty fields and sends senderSignature only when given", () => {
    const body = purchaseBody(
      { txHash: "0xabc1234567", chainId: 8453, amount: 10, appName: "Bot", senderSignature: null, extra: "x" },
      ["txHash", "chainId", "amount", "appName"]
    );
    expect(body).toEqual({ txHash: "0xabc1234567", chainId: 8453, amount: 10, appName: "Bot" });
    const signed = purchaseBody({ txHash: "0xabc1234567", senderSignature: " 0xdead " }, ["txHash"]);
    expect(signed.senderSignature).toBe("0xdead");
  });
});

describe("BUY_API_KEY", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the text to sign when the API asks for senderSignature", async () => {
    fetchMock.mockResolvedValue({ json: async () => missing(TEXT) });
    const replies: string[] = [];
    const result = await buyKeyAction.handler(
      runtimeReturning({ txHash: "0x" + "ab".repeat(32), chainId: 8453, amount: 10, appName: "Bot" }),
      message,
      undefined,
      undefined,
      async (r: { text?: string }) => {
        replies.push(r.text || "");
        return [];
      }
    ) as { success: boolean; data: Record<string, unknown> };

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.insumermodel.com/v1/keys/buy");
    expect(sent).toEqual({ txHash: "0x" + "ab".repeat(32), chainId: 8453, amount: 10, appName: "Bot" });
    expect(result.success).toBe(false);
    expect(result.data.textToSign).toBe(TEXT);
    expect(replies[0]).toContain(TEXT);
  });

  it("sends senderSignature when the user gave one", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, data: { key: "insr_live_x", name: "Bot", creditsAdded: 250, registeredWallet: "0x1" } }),
    });
    const result = await buyKeyAction.handler(
      runtimeReturning({ txHash: "0xabc1234567", chainId: 8453, amount: 10, appName: "Bot", senderSignature: "0xsig" }),
      message
    ) as { success: boolean };
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).senderSignature).toBe("0xsig");
    expect(result.success).toBe(true);
  });

  it("asks for the amount and makes no call without it", async () => {
    const result = await buyKeyAction.handler(
      runtimeReturning({ txHash: "0xabc1234567", chainId: 8453, appName: "Bot" }),
      message
    ) as { success: boolean };
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ADD_CREDITS", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports USDC paid and sends updateWallet only when true", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, data: { creditsAdded: 500, totalCredits: 600, usdcPaid: "20", chainName: "Base" } }),
    });
    const result = await addCreditsAction.handler(
      runtimeReturning({ merchantId: "acme", txHash: "0xabc1234567", chainId: 8453, amount: 20, updateWallet: false }),
      message
    ) as { success: boolean; text: string };
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.insumermodel.com/v1/merchants/acme/credits");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ txHash: "0xabc1234567", chainId: 8453, amount: 20 });
    expect(result.text).toContain("USDC paid: 20");
    expect(result.text).not.toContain("BTC");
  });

  it("shows the text to sign on a credit purchase that binds a wallet", async () => {
    const text = TEXT.replace("key purchase", "credit purchase");
    fetchMock.mockResolvedValue({ json: async () => missing(text) });
    const result = await addCreditsAction.handler(
      runtimeReturning({ merchantId: "acme", txHash: "0xabc1234567", chainId: 8453, amount: 20 }),
      message
    ) as { success: boolean; data: Record<string, unknown> };
    expect(result.success).toBe(false);
    expect(result.data.textToSign).toBe(text);
  });
});
