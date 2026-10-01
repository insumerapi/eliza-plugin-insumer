import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { apiCall } from "../utils/api.js";
import { confirmPaymentTemplate } from "../utils/templates.js";

interface ConfirmPaymentParams {
  code: string;
  txHash: string;
  chainId: number | "solana";
  amount: number | string;
}

export const confirmPaymentAction: Action = {
  name: "CONFIRM_PAYMENT",
  description:
    "Confirm that a USDC payment was made on-chain for a discount code. Verifies the transaction receipt to ensure USDC arrived at the merchant address. Use after ACP_DISCOUNT or UCP_DISCOUNT.",
  similes: [
    "VERIFY_PAYMENT",
    "CONFIRM_USDC",
    "PAYMENT_CONFIRMATION",
    "CHECK_PAYMENT",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Confirm payment for code INSR-A7K3M. I sent 25 USDC on Base, tx hash 0xdef456.",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll verify the USDC payment for that discount code now.",
          actions: ["CONFIRM_PAYMENT"],
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

    const prompt = confirmPaymentTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: ConfirmPaymentParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the payment details. Please provide: discount code (INSR-XXXXX), transaction hash, chain, and USDC amount.",
        });
      }
      return { success: false, text: "Failed to parse payment parameters" };
    }

    if (!params.code || !params.txHash) {
      if (callback) {
        await callback({ text: "Please provide the discount code (INSR-XXXXX) and transaction hash." });
      }
      return { success: false, text: "Missing code or tx hash" };
    }

    const result = await apiCall(apiKey, "POST", "/payment/confirm", params as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `Payment confirmation failed: ${errMsg}` });
      }
      return { success: false, text: errMsg };
    }

    const data = result.data as Record<string, unknown>;
    const confirmed = data.confirmed as boolean;
    const text = confirmed
      ? [
          `Payment confirmed!`,
          ``,
          `Code: ${data.code}`,
          `Amount verified: ${data.amountVerified} USDC`,
          `Chain: ${data.chainName}`,
          `Confirmed at: ${data.confirmedAt}`,
        ].join("\n")
      : `Payment not confirmed. The transaction could not be verified.`;

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
