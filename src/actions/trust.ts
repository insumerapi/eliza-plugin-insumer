import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { apiCall, formatTrustResult, errorData } from "../utils/api.js";
import type { TrustParams } from "../utils/api.js";
import { trustTemplate } from "../utils/templates.js";

export const checkTrustAction: Action = {
  name: "CHECK_TRUST",
  description:
    "Generate an ECDSA-signed wallet trust profile: 155 base checks across 27 chains in 10 dimensions (stablecoins, governance tokens, NFTs, staking, institutional stablecoins, tokenized treasuries, stablecoin deposits, wrapped bitcoin, names, account), up to 176 checks across 29 chains in 14 dimensions with optional Solana, XRPL, Bitcoin, and Tron wallets. Every check is a presence check; the account dimension reports whether contract code or an EIP-7702 delegation is present at the address on Ethereum, Base, Arbitrum, Optimism and Polygon. Returns per-dimension pass/fail counts, no scores, no opinions, just cryptographically verifiable evidence. Stellar and Sui wallets switch on rows inside the base dimensions. Costs 3 credits.",
  similes: [
    "TRUST_PROFILE",
    "WALLET_TRUST",
    "WALLET_REPUTATION",
    "AGENT_TRUST",
    "WALLET_PROFILE",
    "CHECK_WALLET_TRUST",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "What's the trust profile for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll generate a trust profile for that wallet now.",
          actions: ["CHECK_TRUST"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "user",
        content: {
          text: "Check trust for 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B with Solana wallet 6a1mLjefhvSJX1sEX8PTnionbE9DqoYjU6F6bNkT4Ydr",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "Generating a cross-chain trust profile for those wallets.",
          actions: ["CHECK_TRUST"],
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

    const prompt = trustTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: TrustParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the wallet address from the conversation. Please provide an EVM wallet address (0x...).",
        });
      }
      return { success: false, text: "Failed to parse trust parameters" };
    }

    if (!params.wallet) {
      if (callback) {
        await callback({
          text: "Please provide an EVM wallet address (0x...) to generate a trust profile.",
        });
      }
      return { success: false, text: "No wallet address provided" };
    }

    const result = await apiCall(apiKey, "POST", "/trust", params as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `Trust profile failed: ${errMsg}` });
      }
      return { success: false, text: errMsg, data: errorData(result) as ActionResult["data"] };
    }

    const formatted = formatTrustResult(result.data!);
    if (callback) {
      await callback({ text: formatted });
    }
    return { success: true, text: formatted, data: result.data as ActionResult["data"] };
  },
};
