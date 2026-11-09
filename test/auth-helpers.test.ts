/**
 * Unit tests for the merchant-admin helpers in src/utils/auth.ts.
 *
 * Run: npx vitest run
 */

import { describe, it, expect } from "vitest";
import { merchantPath, isValidMerchantId, adminEntityIds, isAuthorizedAdmin } from "../src/utils/auth.js";

function runtime(settings: Record<string, unknown>) {
  return { agentId: "agent", getSetting: (k: string) => settings[k] } as never;
}

describe("merchantPath", () => {
  it("builds the path for a plain ID", () => {
    expect(merchantPath("acme-coffee", "credits")).toBe("/merchants/acme-coffee/credits");
  });

  it("throws on anything that is not a plain merchant ID", () => {
    for (const bad of ["acme/release", "acme?x", "acme#", "..", "a", "", null, 42, "é-shop"]) {
      expect(() => merchantPath(bad, "credits")).toThrow();
      expect(isValidMerchantId(bad)).toBe(false);
    }
  });
});

describe("adminEntityIds / isAuthorizedAdmin", () => {
  it("parses a comma-separated list", () => {
    expect([...adminEntityIds(runtime({ INSUMER_ADMIN_ENTITY_IDS: " a, b ,,c" }))]).toEqual(["a", "b", "c"]);
  });

  it("fails closed with no setting and never trusts the agent's own messages", async () => {
    expect(await isAuthorizedAdmin(runtime({}), { entityId: "a" } as never)).toBe(false);
    expect(await isAuthorizedAdmin(runtime({ INSUMER_ADMIN_ENTITY_IDS: "agent" }), { entityId: "agent" } as never)).toBe(false);
    expect(await isAuthorizedAdmin(runtime({ INSUMER_ADMIN_ENTITY_IDS: "a" }), { content: {} } as never)).toBe(false);
  });
});
