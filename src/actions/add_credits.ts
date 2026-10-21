import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { apiCall, errorData, senderProofText, senderProofReply, purchaseBody } from "../utils/api.js";
import { addCreditsTemplate } from "../utils/templates.js";

interface AddCreditsParams {
  merchantId: string;
  txHash: string;
  chainId: number | "solana";
  amount: number;
  updateWallet?: boolean;
  // The paying wallet's signature over the text the API names. Needed only when the key has no
  // registered wallet yet, or updateWallet moves it to a different sender.
  senderSignature?: string;
}

export const addCreditsAction: Action = {
  name: "ADD_CREDITS",
  description:
    "Add credits to the API key that owns a store (a store has no balance of its own) with USDC. Send USDC on Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche or Solana to the platform wallet, then provide the tx hash and the amount. When the key has no registered wallet yet, or updateWallet moves it to a new wallet, the wallet that sent the payment signs a short text the API names (senderSignature). Discount codes that carry a discount draw on those credits (POST /v1/verify, ACP, UCP). Flat 25 credits per $1 ($0.04/credit) at every purchase size.",
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
          text: "I couldn't extract the credit purchase details. Please provide: merchant ID, transaction hash, chain (Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche or Solana), and the USDC amount.",
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

    if (params.amount === undefined || params.amount === null || (params.amount as unknown) === "") {
      if (callback) {
        await callback({ text: "Please provide the USDC amount you sent (minimum 5)." });
      }
      return { success: false, text: "No amount provided" };
    }

    const { merchantId } = params;
    const body = purchaseBody(params as unknown as Record<string, unknown>, ["txHash", "chainId", "amount"]);
    if (params.updateWallet === true) body.updateWallet = true;
    const result = await apiCall(apiKey, "POST", `/merchants/${merchantId}/credits`, body);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      // The API names the exact text the paying wallet must sign: relay it as is.
      const toSign = senderProofText(result);
      if (toSign) {
        const text = senderProofReply(toSign, result.error?.code === 403);
        if (callback) {
          await callback({ text });
        }
        return {
          success: false,
          text,
          data: { ...errorData(result), textToSign: toSign } as ActionResult["data"],
        };
      }
      if (callback) {
        await callback({ text: `Credit purchase failed: ${errMsg}` });
      }
      return { success: false, text: errMsg, data: errorData(result) as ActionResult["data"] };
    }

    const data = result.data as Record<string, unknown>;
    const text = [
      `Credits added to ${merchantId}!`,
      ``,
      `Credits added: ${data.creditsAdded}`,
      `Total credits: ${data.totalCredits}`,
      `USDC paid: ${data.usdcPaid}`,
      `Chain: ${data.chainName}`,
    ].join("\n");

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
