import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { publicApiCall, errorData, senderProofText, senderProofReply, purchaseBody } from "../utils/api.js";
import { buyKeyTemplate } from "../utils/templates.js";

interface BuyKeyParams {
  txHash: string;
  chainId: number | "solana";
  amount: number;
  appName: string;
  // The paying wallet's signature over the text the API names (always required on /v1/keys/buy).
  senderSignature?: string;
}

export const buyKeyAction: Action = {
  name: "BUY_API_KEY",
  description:
    "Buy a new InsumerAPI key with USDC. No existing API key required. Send USDC on Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche or Solana to the platform wallet, then provide the transaction hash and the amount. The wallet that sent the payment signs a short text the API names (senderSignature), so a transaction hash alone cannot claim the key. The sender wallet becomes the key's identity. One key per wallet.",
  similes: [
    "PURCHASE_API_KEY",
    "GET_API_KEY",
    "BUY_KEY",
    "CREATE_API_KEY",
    "ONBOARD_AGENT",
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "I sent 10 USDC on Base, tx hash 0xabc123. Get me an API key for my agent called 'TrustBot'.",
        },
      } as ActionExample,
      {
        name: "assistant",
        content: {
          text: "I'll verify your payment and create your API key now.",
          actions: ["BUY_API_KEY"],
        },
      } as ActionExample,
    ],
  ],

  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    // No API key required: this is the endpoint that creates one
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    // Build state if not provided
    if (!state) {
      state = await runtime.composeState(message, []);
    }

    // Build extraction prompt
    const prompt = buyKeyTemplate.replace(
      "{{recentMessages}}",
      state.text || message.content.text || ""
    );

    // Extract structured params via LLM
    const extracted = await runtime.useModel("TEXT_SMALL" as never, {
      prompt,
      stopSequences: [] as string[],
    } as never) as string;

    let params: BuyKeyParams;
    try {
      params = JSON.parse(extracted);
    } catch {
      if (callback) {
        await callback({
          text: "I couldn't extract the purchase parameters. Please provide: transaction hash, chain (Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche or Solana), USDC amount, and a name for your key.",
        });
      }
      return { success: false, text: "Failed to parse purchase parameters" };
    }

    if (!params.txHash) {
      if (callback) {
        await callback({ text: "Please provide the transaction hash." });
      }
      return { success: false, text: "No transaction hash provided" };
    }
    if (params.amount === undefined || params.amount === null || (params.amount as unknown) === "") {
      if (callback) {
        await callback({ text: "Please provide the USDC amount you sent (minimum 5)." });
      }
      return { success: false, text: "No amount provided" };
    }
    if (!params.appName) {
      if (callback) {
        await callback({ text: "Please provide a name for your API key." });
      }
      return { success: false, text: "No app name provided" };
    }

    // Call InsumerAPI (public endpoint, no auth needed)
    const body = purchaseBody(params as unknown as Record<string, unknown>, ["txHash", "chainId", "amount", "appName"]);
    const result = await publicApiCall("POST", "/keys/buy", body);

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
        await callback({ text: `Key purchase failed: ${errMsg}` });
      }
      return { success: false, text: errMsg, data: errorData(result) as ActionResult["data"] };
    }

    const data = result.data as Record<string, unknown>;
    // The key string is omitted when the paying EVM wallet receives the
    // Insumer Access pass on this purchase (the API's default); that wallet
    // then authenticates with an Authorization: Wallet header.
    const hasKey = typeof data.key === "string" && data.key.length > 0;
    const text = [
      hasKey ? `API key created successfully!` : `Purchase confirmed: this wallet is the credential.`,
      ``,
      ...(hasKey ? [`Key: ${data.key}`] : []),
      `Name: ${data.name}`,
      `Credits: ${data.creditsAdded}`,
      `Wallet: ${data.registeredWallet}`,
      ``,
      ...(hasKey
        ? [
            `Store this key securely: it is only shown once.`,
            `Use it as your INSUMER_API_KEY to access all verification endpoints.`,
          ]
        : [
            typeof data.authHint === "string" && data.authHint
              ? data.authHint
              : `No key string was issued: the wallet holds the Insumer Access pass and signs requests with an Authorization: Wallet header.`,
          ]),
    ].join("\n");

    if (callback) {
      await callback({ text });
    }
    return { success: true, text, data: data as ActionResult["data"] };
  },
};
