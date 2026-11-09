import type { IAgentRuntime, Memory } from "@elizaos/core";

/**
 * Who may run the merchant-admin actions (CREATE_MERCHANT, CONFIGURE_TOKENS, ADD_CREDITS).
 *
 * Those actions spend or change state on the operator's API key, so they run only for a sender
 * the operator has named. Two ways to name one:
 *
 *   INSUMER_ADMIN_ENTITY_IDS           comma-separated ElizaOS entity ids allowed to run them.
 *   INSUMER_ADMIN_ALLOW_SERVER_ROLES   "true" also lets an entity with the OWNER or ADMIN role
 *                                      in the message's world run them. Off by default: whoever
 *                                      owns a server the agent joins holds that role there.
 *
 * With neither set, nobody can run them (fail closed). Read-only actions are not gated.
 */

function settingString(runtime: IAgentRuntime, key: string): string {
  const v = runtime.getSetting(key);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function settingEnabled(runtime: IAgentRuntime, key: string): boolean {
  return settingString(runtime, key).trim().toLowerCase() === "true";
}

export function adminEntityIds(runtime: IAgentRuntime): Set<string> {
  return new Set(
    settingString(runtime, "INSUMER_ADMIN_ENTITY_IDS")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

async function hasAdminRole(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
  try {
    const entityId = message.entityId as string | undefined;
    if (!entityId || !message.roomId) return false;
    const room = await runtime.getRoom(message.roomId);
    const worldId = room?.worldId;
    if (!worldId) return false;
    const world = await runtime.getWorld(worldId);
    const roles = world?.metadata?.roles as Record<string, unknown> | undefined;
    const role = roles?.[entityId];
    return role === "OWNER" || role === "ADMIN";
  } catch {
    return false;
  }
}

/** True only when the message's sender is allowed to run the merchant-admin actions. */
export async function isAuthorizedAdmin(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
  const entityId = message?.entityId as string | undefined;
  if (!entityId) return false;
  // The agent's own messages never count as an operator instruction.
  if (runtime.agentId && entityId === runtime.agentId) return false;
  if (adminEntityIds(runtime).has(entityId)) return true;
  if (settingEnabled(runtime, "INSUMER_ADMIN_ALLOW_SERVER_ROLES")) {
    return hasAdminRole(runtime, message);
  }
  return false;
}

export const NOT_AUTHORIZED_TEXT =
  "Only the agent's operator can run merchant admin actions (creating a store, changing its tokens or adding credits). Nothing was changed.";

/**
 * The text an admin action extracts its parameters from: the requesting sender's own recent
 * messages in this room, never what other people in the room wrote. Falls back to the
 * requesting message alone.
 */
export async function requesterContext(runtime: IAgentRuntime, message: Memory, count = 10): Promise<string> {
  const own = message?.content?.text || "";
  try {
    if (!message.roomId || !message.entityId) return own;
    const memories = await runtime.getMemories({
      roomId: message.roomId,
      tableName: "messages",
      count: count * 4,
    });
    const mine = (Array.isArray(memories) ? memories : [])
      .filter((m) => m && m.entityId === message.entityId && m.id !== message.id)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .slice(-(count - 1))
      .map((m) => m.content?.text || "")
      .filter((t) => t.length > 0);
    return [...mine, own].join("\n");
  } catch {
    return own;
  }
}

// --- Path parameters ---

/** A merchant id as the API defines it: 2 to 50 letters, digits, dashes or underscores. */
export const MERCHANT_ID_PATTERN = /^[A-Za-z0-9_-]{2,50}$/;

export function isValidMerchantId(id: unknown): id is string {
  return typeof id === "string" && MERCHANT_ID_PATTERN.test(id);
}

/**
 * Build a /merchants/{id}/... path. Throws on an id that is not a plain merchant id, and
 * encodes it either way, so a value can never change which route the request reaches.
 */
export function merchantPath(id: unknown, suffix: string): string {
  if (!isValidMerchantId(id)) {
    throw new Error("Invalid merchant ID");
  }
  return `/merchants/${encodeURIComponent(id)}/${suffix}`;
}
