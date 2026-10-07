import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { apiCall, errorData } from "../utils/api.js";
import { addCreditsTemplate } from "../utils/templates.js";

interface AddCreditsParams {
  merchantId: string;
  txHash: string;
  chainId: number | "solana" | "bitcoin" | "tron";
  amount?: number;
  updateWallet?: boolean;
}

export const addCreditsAction: Action = {
  name: "ADD_CREDITS",
  description:
    "Add credits to the API key that owns a store (a store has no balance of its own) with USDC, USDT, or BTC. Send crypto to the platform wallet, then provide the tx hash. USDC/USDT auto-detected on EVM/Solana. BTC on Bitcoin (converted to USD at market rate). Discount codes that carry a discount draw on those credits (POST /v1/verify, ACP, UCP). Flat 25 credits per $1.",
  similes: [
    "BUY_MERCHANT_CREDITS",
    "TOP_UP_CREDITS",
    "ADD_MERCHANT_CREDITS",
    "PURCHASE_CREDITS",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "I sent 20 USDC on Base (tx 0xabc123) to top up credits for merchant acme-coffee.",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll verify the payment and add credits to acme-coffee now.",
          actions: ["ADD_CREDITS"],
        },
      } as ActionExample,
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const apiKey = runtime.getSetting("INSUMER_API_KEY");
    return typeof apiKey === "string" && apiKey.startsWith("insr_live_");
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const apiKey = runtime.getSetting("INSUMER_API_KEY") as string;

    if (!state) {
      state = await runtime.composeState(message, []);
    }

    const prompt = addCreditsTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: AddCreditsParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the credit purchase details. Please provide: merchant ID, transaction hash, chain, and amount (for stablecoins).",
        });
      }
      return { success: false, text: "Failed to parse credit purchase parameters" };
    }

    if (!params.merchantId || !params.txHash) {
      if (callback) {
        await callback({ text: "Please provide the merchant ID and transaction hash." });
      }
      return { success: false, text: "Missing merchant ID or tx hash" };
    }

    const { merchantId, ...body } = params;
    const result = await apiCall(apiKey, "POST", `/merchants/${merchantId}/credits`, body as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `Credit purchase failed: ${errMsg}` });
      }
      return { success: false, text: errMsg, data: errorData(result) as ActionResult["data"] };
    }

    const data = result.data as Record<string, unknown>;
    const isBtc = data.btcPaid !== undefined;
    const paymentLine = isBtc
      ? `BTC paid: ${data.btcPaid} (≈$${data.usdEquivalent} at $${data.btcPrice})`
      : `USDC paid: ${data.usdcPaid}`;
    const text = [
      `Credits added to ${merchantId}!`,
      ``,
      `Credits added: ${data.creditsAdded}`,
      `Total credits: ${data.totalCredits}`,
      paymentLine,
      `Chain: ${data.chainName}`,
    ].join("\n");

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
