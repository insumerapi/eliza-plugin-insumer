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
import { createMerchantTemplate } from "../utils/templates.js";

interface CreateMerchantParams {
  companyName: string;
  companyId: string;
  location?: string;
}

export const createMerchantAction: Action = {
  name: "CREATE_MERCHANT",
  description:
    "Create a new merchant on InsumerAPI. The agent's API key becomes the merchant owner. Receives 100 free verification credits. Max 10 merchants per API key.",
  similes: [
    "NEW_MERCHANT",
    "SETUP_MERCHANT",
    "REGISTER_MERCHANT",
    "ONBOARD_MERCHANT",
    "CREATE_STORE",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Create a merchant called 'Acme Coffee' with ID acme-coffee, located in New York.",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll create the Acme Coffee merchant now.",
          actions: ["CREATE_MERCHANT"],
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

    const prompt = createMerchantTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: CreateMerchantParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the merchant details. Please provide a company name and a unique ID (alphanumeric, dashes, underscores).",
        });
      }
      return { success: false, text: "Failed to parse merchant parameters" };
    }

    if (!params.companyName || !params.companyId) {
      if (callback) {
        await callback({
          text: "Please provide both a company name and a unique company ID (e.g. 'acme-coffee').",
        });
      }
      return { success: false, text: "Missing required merchant fields" };
    }

    const result = await apiCall(apiKey, "POST", "/merchants", params as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `Merchant creation failed: ${errMsg}` });
      }
      return { success: false, text: errMsg };
    }

    const data = result.data as Record<string, unknown>;
    const text = [
      `Merchant created successfully!`,
      ``,
      `ID: ${data.id}`,
      `Name: ${data.companyName}`,
      `Credits: ${data.credits} (free starter credits)`,
      ``,
      `Next steps: configure token tiers with CONFIGURE_TOKENS, then add credits with ADD_CREDITS.`,
    ].join("\n");

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
