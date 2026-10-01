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
import { configureTokensTemplate } from "../utils/templates.js";

interface TokenTier {
  name: string;
  threshold: number;
  discount: number;
}

interface TokenConfig {
  symbol: string;
  chainId: number;
  contractAddress: string;
  decimals: number;
  currency?: string;
  tiers: TokenTier[];
}

interface ConfigureTokensParams {
  merchantId: string;
  ownToken?: TokenConfig | null;
  partnerTokens?: TokenConfig[];
}

export const configureTokensAction: Action = {
  name: "CONFIGURE_TOKENS",
  description:
    "Configure which tokens gate access to merchant discounts and set tier thresholds. Supports own token + up to 7 partner tokens with 1-4 discount tiers each. EVM chains + Solana + XRPL supported.",
  similes: [
    "SET_TOKEN_TIERS",
    "CONFIGURE_TOKEN_GATING",
    "SETUP_TOKENS",
    "TOKEN_TIERS",
    "SET_DISCOUNTS",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Set up USDC token gating for merchant acme-coffee: Bronze at 100 USDC (5% off), Silver at 1000 (10%), Gold at 10000 (15%) on Ethereum.",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll configure the USDC token tiers for acme-coffee now.",
          actions: ["CONFIGURE_TOKENS"],
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

    const prompt = configureTokensTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: ConfigureTokensParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the token configuration. Please specify a merchant ID, token symbol, chain, contract address, and discount tiers.",
        });
      }
      return { success: false, text: "Failed to parse token configuration" };
    }

    if (!params.merchantId) {
      if (callback) {
        await callback({ text: "Please provide the merchant ID to configure tokens for." });
      }
      return { success: false, text: "No merchant ID provided" };
    }

    const { merchantId, ...body } = params;
    const result = await apiCall(apiKey, "PUT", `/merchants/${merchantId}/tokens`, body as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `Token configuration failed: ${errMsg}` });
      }
      return { success: false, text: errMsg };
    }

    const data = result.data as Record<string, unknown>;
    const text = [
      `Token tiers configured for ${merchantId}!`,
      ``,
      `Total tokens: ${data.totalTokens}/${data.maxTokens}`,
    ].join("\n");

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
