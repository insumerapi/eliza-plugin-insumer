import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { apiCall, formatBatchResult, errorData } from "../utils/api.js";
import type { BatchTrustParams } from "../utils/api.js";
import { batchTrustTemplate } from "../utils/templates.js";

export const checkTrustBatchAction: Action = {
  name: "CHECK_TRUST_BATCH",
  description:
    "Generate trust profiles for up to 10 wallets in a single request. Faster than sequential calls. Each wallet gets an independently ECDSA-signed profile. Supports partial success. Costs 3 credits per successful wallet.",
  similes: [
    "BATCH_TRUST",
    "BULK_TRUST_CHECK",
    "MULTI_WALLET_TRUST",
    "CHECK_MULTIPLE_WALLETS",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Check trust profiles for these three wallets: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045, 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B, and 0x1234567890abcdef1234567890abcdef12345678",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll generate trust profiles for all three wallets in a single batch.",
          actions: ["CHECK_TRUST_BATCH"],
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

    const prompt = batchTrustTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: BatchTrustParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the wallet addresses from the conversation. Please list the EVM wallet addresses (0x...) you want to check.",
        });
      }
      return { success: false, text: "Failed to parse batch parameters" };
    }

    if (!params.wallets || params.wallets.length === 0) {
      if (callback) {
        await callback({
          text: "Please provide at least one EVM wallet address (0x...) for batch trust profiling.",
        });
      }
      return { success: false, text: "No wallets provided" };
    }

    if (params.wallets.length > 10) {
      params.wallets = params.wallets.slice(0, 10);
    }

    const result = await apiCall(apiKey, "POST", "/trust/batch", params as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `Batch trust check failed: ${errMsg}` });
      }
      return { success: false, text: errMsg, data: errorData(result) as ActionResult["data"] };
    }

    const formatted = formatBatchResult(result.data!);
    if (callback) {
      await callback({ text: formatted });
    }
    return { success: true, text: formatted, data: result.data as ActionResult["data"] };
  },
};
