import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { isAuthorizedAdmin, requesterContext, NOT_AUTHORIZED_TEXT } from "../utils/auth.js";
import { apiCall, errorData } from "../utils/api.js";
import { createMerchantTemplate } from "../utils/templates.js";

interface CreateMerchantParams {
  companyName: string;
  companyId: string;
  location?: string;
}

export const createMerchantAction: Action = {
  name: "CREATE_MERCHANT",
  description:
    "Operator only. Create a new merchant on InsumerAPI. The agent's API key becomes the merchant owner. Discount codes draw on the credits of the API key that owns it. A limited number of merchants per API key; past it the API answers 429.",
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

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const apiKey = runtime.getSetting("INSUMER_API_KEY");
    if (typeof apiKey !== "string" || !apiKey.startsWith("insr_live_")) return false;
    // Merchant admin: only a sender the operator named (see utils/auth.ts).
    return isAuthorizedAdmin(runtime, message);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const apiKey = runtime.getSetting("INSUMER_API_KEY") as string;

    if (!(await isAuthorizedAdmin(runtime, message))) {
      if (callback) {
        await callback({ text: NOT_AUTHORIZED_TEXT });
      }
      return { success: false, text: NOT_AUTHORIZED_TEXT };
    }

    // Parameters come from the requester's own messages, never from others in the room.
    const prompt = createMerchantTemplate.replace(
      "{{recentMessages}}",
      await requesterContext(runtime, message)
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
      return { success: false, text: errMsg, data: errorData(result) as ActionResult["data"] };
    }

    const data = result.data as Record<string, unknown>;
    const text = [
      `Merchant created successfully!`,
      ``,
      `ID: ${data.id}`,
      `Name: ${data.companyName}`,
      `Credits: ${data.credits} (the owner key's balance)`,
      ``,
      `Next steps: configure token tiers with CONFIGURE_TOKENS, then add credits with ADD_CREDITS.`,
    ].join("\n");

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
