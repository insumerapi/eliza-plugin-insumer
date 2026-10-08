import type {
  Action,
  ActionResult,
  ActionExample,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { publicApiCall, errorData } from "../utils/api.js";
import { buyKeyTemplate } from "../utils/templates.js";

interface BuyKeyParams {
  txHash: string;
  chainId: number | "solana" | "bitcoin" | "tron";
  amount?: number;
  appName: string;
}

export const buyKeyAction: Action = {
  name: "BUY_API_KEY",
  description:
    "Buy a new InsumerAPI key with USDC, USDT, or BTC. No existing API key required. Send crypto to the platform wallet, then provide the transaction hash. The sender wallet becomes the key's identity. One key per wallet. USDC/USDT auto-detected on EVM/Solana. USDT-TRC20 on Tron. BTC on Bitcoin (converted to USD at market rate).",
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
          text: "I sent 10 USDC on Base, tx hash 0xabc123. Get me an API key for my agent called 'TrustBot'. (Also accepts USDT or BTC)",
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
          text: "I couldn't extract the purchase parameters. Please provide: transaction hash, chain (e.g. Base, Ethereum, Solana, Bitcoin), amount (for stablecoins), and a name for your key.",
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
    if (!params.appName) {
      if (callback) {
        await callback({ text: "Please provide a name for your API key." });
      }
      return { success: false, text: "No app name provided" };
    }

    // Call InsumerAPI (public endpoint, no auth needed)
    const result = await publicApiCall("POST", "/keys/buy", params as unknown as Record<string, unknown>);

    if (!result.ok) {
      const errMsg = result.error?.message || "Unknown API error";
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
