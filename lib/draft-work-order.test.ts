import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { draftWorkOrder } from "./draft-work-order";
import { loadMockProperties } from "./mock-properties";
import { SAMPLE_EMAIL } from "./sample-email";
import { isoDate, type ServiceRequest } from "./work-order";

const TODAY = isoDate("2026-10-30");

const REPEAT_MESSAGE =
  "Same problem serviced on 2026-04-14. The repair is under workmanship warranty until 2027-04-14. A reviewer must decide warranty or billable before dispatch.";

function modelReturning(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 400, noCache: 400, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 120, text: 120, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

function deps(model: MockLanguageModelV4) {
  return { model, loadProperties: loadMockProperties, today: TODAY };
}

function promptText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(promptText).join("\n");
  if (value !== null && typeof value === "object") {
    return Object.values(value).map(promptText).join("\n");
  }
  return "";
}

const harborLeak: ServiceRequest = {
  requester: {
    name: "Dana Whitfield",
    company: "Harbor Point Logistics",
    phone: "555-0142",
    email: "dana.whitfield@harborpointlogistics.example",
  },
  site: {
    buildingName: "Harbor Point Logistics, Building B",
    address: "2200 Industrial Pkwy, Riverton",
  },
  problem: "active_leak",
  waterInside: true,
  urgency: "emergency",
  summary:
    "Water is coming through the roof over dock doors 4 and 5, with standing water on the dock floor.",
  accessNotes: "The gate code is 4417 and the roof hatch is in the mechanical room behind dock 6.",
};

const lakeview: ServiceRequest = {
  requester: {
    name: "Pat Morgan",
    company: null,
    phone: "555-0199",
    email: null,
  },
  site: { buildingName: null, address: "900 Lakeview Blvd" },
  problem: "active_leak",
  waterInside: true,
  urgency: "soon",
  summary: "The roof at 900 Lakeview Blvd is leaking.",
  accessNotes: null,
};

describe("draftWorkOrder", () => {
  it("drafts a pending-approval emergency order for Harbor Point Building B", async () => {
    const model = modelReturning(JSON.stringify(harborLeak));

    const result = await draftWorkOrder(SAMPLE_EMAIL, deps(model));

    expect(model.doGenerateCalls).toHaveLength(1);
    const call = model.doGenerateCalls[0];
    expect(promptText(call?.prompt)).toContain(SAMPLE_EMAIL);
    expect(result).toMatchObject({
      kind: "drafted",
      draft: {
        status: "pending_approval",
        priority: "emergency",
        property: { kind: "matched", property: { id: "harbor-point-building-b" } },
      },
    });
    if (result.kind !== "drafted") return;
    expect(result.draft.flags.map((flag) => flag.code)).toEqual([
      "warranty_active",
      "repeat_problem",
    ]);
    expect(result.draft.flags.find((flag) => flag.code === "warranty_active")?.message).toBe(
      "Under Apex Membrane Co. warranty until 2031-12-31. Confirm repair terms before dispatch.",
    );
    expect(result.draft.flags.find((flag) => flag.code === "repeat_problem")?.message).toBe(
      REPEAT_MESSAGE,
    );
  });

  it("still drafts when 900 Lakeview Blvd matches no building", async () => {
    const result = await draftWorkOrder(
      "The roof at 900 Lakeview Blvd is leaking.",
      deps(modelReturning(JSON.stringify(lakeview))),
    );

    expect(result).toMatchObject({
      kind: "drafted",
      draft: {
        status: "pending_approval",
        property: { kind: "unmatched" },
      },
    });
    if (result.kind !== "drafted") return;
    expect(result.draft.flags.map((flag) => flag.code)).toEqual(["property_unmatched"]);
    expect(result.draft.flags[0]?.message).toBe(
      'No building on file matches "900 Lakeview Blvd".',
    );
  });

  it("identifies the building from its street address alone", async () => {
    const flashingLeak: ServiceRequest = {
      ...lakeview,
      site: { buildingName: null, address: "815 Commerce Drive, Riverton" },
      problem: "flashing",
      waterInside: false,
      urgency: "routine",
      summary: "Flashing is pulling away around a rooftop unit.",
    };

    const result = await draftWorkOrder(
      "Flashing is loose around a rooftop unit at 815 Commerce Drive.",
      deps(modelReturning(JSON.stringify(flashingLeak))),
    );

    expect(result).toMatchObject({
      kind: "drafted",
      draft: {
        status: "pending_approval",
        priority: "normal",
        property: { kind: "matched", property: { id: "riverton-medical-plaza" } },
        flags: [{ code: "repeat_problem", message: "Same problem serviced on 2026-07-22." }],
      },
    });
  });

  it("reports unreadable when the model output does not fit the request schema", async () => {
    const result = await draftWorkOrder(SAMPLE_EMAIL, deps(modelReturning('{"problem":"leaky"}')));

    expect(result).toEqual({ kind: "unreadable" });
  });
});
