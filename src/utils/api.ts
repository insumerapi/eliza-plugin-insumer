const API_BASE = "https://api.insumermodel.com/v1";

// --- Types ---

export interface ApiResponse {
  ok: boolean;
  data?: Record<string, unknown>;
  // code is the HTTP status as a number for most errors, and the string "rpc_failure" on a 503
  // where a read did not complete. failedConditions is present on rpc_failure only.
  error?: {
    code: number | string;
    message: string;
    failedConditions?: Array<{ source?: string; chainId?: number | string | null; message?: string }>;
  };
  meta?: { version: string; timestamp: string };
}

export interface AttestCondition {
  type: "token_balance" | "nft_ownership" | "eas_attestation" | "farcaster_id" | "evm_view_call" | "ratio_to_amount" | "ratio_to_supply" | "erc8004_agent" | "erc7710_delegation" | "account_code";
  contractAddress?: string;
  // account_code (EVM chainId only): the code state the wallet address itself must be in at the
  // anchored block. "none" = no code (a plain key account); "eip7702" = the EIP-7702 delegation
  // designator (a key that has delegated execution to a contract); "contract" = any other code
  // (a smart-contract wallet, a protocol, a token). Required for account_code. The result is the
  // boolean met; the code and the delegation target are never returned.
  expect?: "none" | "eip7702" | "contract";
  // account_code with expect "eip7702" only (a 400 with any other expect): an EVM address; met
  // iff the designator points at it. Echoed, lowercase, inside the signed evaluatedCondition.
  delegate?: string;
  chainId?: number | "solana" | "xrpl" | "bitcoin" | "tron" | "stellar" | "sui";
  // token_balance threshold is sent as a decimal string (v2 keys require it; v1 keys
  // accept either). A number is coerced to a string before the request is sent.
  threshold?: string | number;
  // ratio_to_amount: met iff balance >= multiple * amount (EVM chains only).
  // Sent as decimal strings on v2 keys (numbers are coerced before the request).
  multiple?: string | number;
  amount?: string | number;
  // ratio_to_supply: met iff balance / totalSupply() >= minFraction, a fraction in (0,1] (EVM chains, ERC-20 only).
  minFraction?: string | number;
  decimals?: number;
  currency?: string;
  assetCode?: string;
  taxon?: number;
  label?: string;
  schemaId?: string;
  attester?: string;
  indexer?: string;
  template?: string;
}

export interface AttestParams {
  wallet?: string;
  solanaWallet?: string;
  xrplWallet?: string;
  bitcoinWallet?: string;
  tronWallet?: string;
  stellarWallet?: string;
  suiWallet?: string;
  proof?: "merkle";
  format?: "jwt";
  conditions: AttestCondition[];
}

export interface TrustParams {
  wallet: string;
  solanaWallet?: string;
  xrplWallet?: string;
  bitcoinWallet?: string;
  tronWallet?: string;
  stellarWallet?: string;
  suiWallet?: string;
  proof?: "merkle";
}

export interface BatchTrustParams {
  wallets: Array<{
    wallet: string;
    solanaWallet?: string;
    xrplWallet?: string;
    bitcoinWallet?: string;
    tronWallet?: string;
    stellarWallet?: string;
    suiWallet?: string;
  }>;
  proof?: "merkle";
}

// --- API helper ---

export async function apiCall(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<ApiResponse> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<ApiResponse>;
}

export async function publicApiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<ApiResponse> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<ApiResponse>;
}

// --- Error passthrough ---

/**
 * What an action returns in `data` when the API answers ok: false, so a caller can tell a
 * retryable read failure (code "rpc_failure") from a request it has to change (a 400).
 * rpc_failure is never a verdict about the wallet.
 */
export function errorData(result: ApiResponse): Record<string, unknown> {
  const err = result.error;
  const out: Record<string, unknown> = {
    code: err?.code ?? null,
    retryable: err?.code === "rpc_failure",
  };
  if (Array.isArray(err?.failedConditions)) {
    out.failedConditions = err.failedConditions;
  }
  return out;
}

// --- Response formatters ---

interface AttestResult {
  condition: number;
  label?: string;
  type: string;
  chainId?: number | string;
  met: boolean;
  blockNumber?: string;
  blockTimestamp?: string;
  ledgerIndex?: number;
  ledgerHash?: string;
  trustLineState?: { frozen: boolean };
}

interface TrustDimension {
  // A check on a chain whose wallet was not supplied carries evaluated: false and the name of
  // the wallet parameter it needs. It was not run, so it is neither a pass nor a fail.
  checks: Array<{ label: string; met: boolean; evaluated?: boolean; requires?: string }>;
  passCount: number;
  failCount: number;
  notEvaluatedCount?: number;
  total: number;
}

/**
 * Format an attest API response for display.
 * API shape: data = { attestation: { id, pass, results, passCount, failCount, expiresAt }, sig, kid, jwt? }
 */
export function formatAttestResult(data: Record<string, unknown>): string {
  const attestation = data.attestation as Record<string, unknown> | undefined;
  const id = attestation?.id as string;
  const pass = attestation?.pass as boolean;
  const results = (attestation?.results || []) as AttestResult[];
  const lines: string[] = [
    `Attestation ${id}: ${pass ? "PASS" : "FAIL"}`,
    "",
  ];
  for (const r of results) {
    const icon = r.met ? "+" : "-";
    const chain =
      r.chainId !== undefined ? ` (chain ${r.chainId})` : "";
    let extra = "";
    if (r.ledgerIndex !== undefined) {
      extra += ` | ledger ${r.ledgerIndex}`;
    }
    if (r.trustLineState?.frozen) {
      extra += " | FROZEN trust line";
    }
    lines.push(`  [${icon}] ${r.label || r.type}${chain}${extra}`);
  }
  const passCount = attestation?.passCount as number;
  const failCount = attestation?.failCount as number;
  lines.push("", `${passCount} passed, ${failCount} failed`);
  if (attestation?.expiresAt) {
    lines.push(`Expires: ${attestation.expiresAt}`);
  }
  if (data.jwt) {
    lines.push("", `JWT: ${data.jwt}`);
  }
  return lines.join("\n");
}

/**
 * Format a trust API response for display.
 * API shape: data = { trust: { id, dimensions, summary, ... }, sig, kid }
 *
 * One line per dimension. A profile runs 155 to 176 checks, so the checks themselves are not
 * listed: they are in the action's `data`. Checks that were not evaluated (their wallet was
 * not supplied) are counted on their own and never shown as failed.
 *
 * Dimensions print in a fixed order: the base dimensions, then the per-wallet dimensions that
 * were switched on, then any other dimension alphabetically.
 */
const DIMENSION_ORDER = [
  "stablecoins",
  "governance",
  "nfts",
  "staking",
  "institutional_stablecoins",
  "tokenized_treasuries",
  "stablecoin_deposits",
  "wrapped_bitcoin",
  "names",
  "account",
  "solana",
  "xrpl",
  "bitcoin",
  "tron",
];

export function orderDimensions<T>(dimensions: Record<string, T>): Array<[string, T]> {
  const rank = new Map(DIMENSION_ORDER.map((name, i) => [name, i]));
  return Object.entries(dimensions).sort(([a], [b]) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export function formatTrustResult(data: Record<string, unknown>): string {
  const trust = data.trust as Record<string, unknown> | undefined;
  const id = trust?.id as string;
  const dimensions = trust?.dimensions as Record<string, TrustDimension> | undefined;
  const summary = trust?.summary as Record<string, unknown> | undefined;
  const lines: string[] = [`Trust Profile ${id}`];
  const needed = new Set<string>();
  let notEvaluatedTotal = 0;
  if (dimensions) {
    for (const [name, dim] of orderDimensions(dimensions)) {
      const checks = Array.isArray(dim.checks) ? dim.checks : [];
      const skipped = checks.filter((c) => c.evaluated === false);
      for (const c of skipped) {
        if (c.requires) needed.add(c.requires);
      }
      const notEvaluated =
        typeof dim.notEvaluatedCount === "number" ? dim.notEvaluatedCount : skipped.length;
      notEvaluatedTotal += notEvaluated;
      const tail = notEvaluated > 0 ? `, ${notEvaluated} not evaluated` : "";
      lines.push(`  ${name}: ${dim.passCount}/${dim.total} passed${tail}`);
    }
  }
  if (summary) {
    const totalNotEvaluated =
      typeof summary.totalNotEvaluated === "number" ? summary.totalNotEvaluated : notEvaluatedTotal;
    const accountDim = dimensions?.account;
    const accountPresent = typeof accountDim?.passCount === "number" ? accountDim.passCount : null;
    const split = accountPresent !== null && typeof summary.totalPassed === "number" && summary.totalPassed >= accountPresent
      ? ` (${summary.totalPassed - accountPresent} assets held, ${accountPresent} account facts present)`
      : "";
    lines.push(`Overall: ${summary.totalPassed}/${summary.totalChecks} checks passed${split}`);
    if (totalNotEvaluated > 0) {
      const how = needed.size > 0 ? ` Supply ${[...needed].sort().join(", ")} to run them.` : "";
      lines.push(
        `${totalNotEvaluated} of ${summary.totalChecks} checks were not evaluated: no wallet was supplied for their chain.${how}`
      );
    }
  }
  return lines.join("\n");
}

/**
 * Format a batch trust API response for display.
 * API shape: data = { results: [{ trust: { id, wallet, summary, ... }, sig, kid } | { error: { wallet, message } }], summary: { requested, succeeded, failed } }
 */
export function formatBatchResult(data: Record<string, unknown>): string {
  const results = (data.results || []) as Array<Record<string, unknown>>;
  const batchSummary = data.summary as Record<string, unknown> | undefined;
  const lines: string[] = [`Batch Trust: ${results.length} profiles`, ""];
  for (const result of results) {
    if (result.error) {
      const err = result.error as Record<string, unknown>;
      lines.push(`  ${err.wallet}: ERROR: ${err.message}`);
    } else {
      const trust = result.trust as Record<string, unknown> | undefined;
      const summary = trust?.summary as Record<string, unknown> | undefined;
      const dims = trust?.dimensions as Record<string, { passCount?: unknown }> | undefined;
      const accountPresent = typeof dims?.account?.passCount === "number" ? dims.account.passCount : null;
      const facts = accountPresent !== null ? `, ${accountPresent} account facts` : "";
      lines.push(
        `  ${trust?.wallet}: ${summary?.totalPassed ?? "?"}/${summary?.totalChecks ?? "?"} checks passed${facts} (${trust?.id})`
      );
    }
  }
  if (batchSummary) {
    lines.push("", `${batchSummary.succeeded}/${batchSummary.requested} succeeded`);
  }
  return lines.join("\n");
}
