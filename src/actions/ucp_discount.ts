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
import { ucpDiscountTemplate } from "../utils/templates.js";

interface UcpDiscountParams {
  merchantId: string;
  wallet?: string;
  solanaWallet?: string;
  xrplWallet?: string;
  bitcoinWallet?: string;
  tronWallet?: string;
  stellarWallet?: string;
  suiWallet?: string;
  items?: Array<{ path: string; amount: number }>;
}

export const ucpDiscountAction: Action = {
  name: "UCP_DISCOUNT",
  description:
    "Check discount eligibility in Google Universal Commerce Protocol (UCP) format. Returns title-based discounts, allocations, and a signed verification code. Costs 1 merchant credit.",
  similes: [
    "UCP_CHECK",
    "GOOGLE_DISCOUNT",
    "UNIVERSAL_COMMERCE_DISCOUNT",
    "CHECK_UCP_DISCOUNT",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Check UCP discount for wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 at merchant acme-coffee.",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll check the UCP discount eligibility now.",
          actions: ["UCP_DISCOUNT"],
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

    const prompt = ucpDiscountTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: UcpDiscountParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the discount parameters. Please provide a merchant ID and wallet address.",
        });
      }
      return { success: false, text: "Failed to parse UCP discount parameters" };
    }

    if (!params.merchantId) {
      if (callback) {
        await callback({ text: "Please provide the merchant ID." });
      }
      return { success: false, text: "No merchant ID provided" };
    }
    if (
      !params.wallet &&
      !params.solanaWallet &&
      !params.xrplWallet &&
      !params.bitcoinWallet &&
      !params.tronWallet &&
      !params.stellarWallet &&
      !params.suiWallet
    ) {
      if (callback) {
        await callback({ text: "Please provide a wallet address to check discount eligibility." });
      }
      return { success: false, text: "No wallet address provided" };
    }

    const result = await apiCall(apiKey, "POST", "/ucp/discount", params as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
      if (callback) {
        await callback({ text: `UCP discount check failed: ${errMsg}` });
      }
      return { success: false, text: errMsg };
    }

    const data = result.data as Record<string, unknown>;
    const discounts = data.discounts as Record<string, unknown> | undefined;
    const codes = (discounts?.codes || []) as string[];
    const applied = (discounts?.applied || []) as Array<Record<string, unknown>>;
    const verification = data.verification as Record<string, unknown> | undefined;

    const lines = [`UCP Discount Result`, ``];
    if (codes.length > 0) {
      lines.push(`Discount code: ${codes[0]}`);
    }
    if (applied.length > 0) {
      const discount = applied[0] as Record<string, unknown>;
      if (discount.title) {
        lines.push(`Discount: ${discount.title}`);
      }
    }
    if (verification) {
      lines.push(`Verification code: ${verification.code}`);
    }
    if (codes.length === 0 && !verification) {
      lines.push(`No discount eligible for this wallet at this merchant.`);
    }

    const text = lines.join("\n");
    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
