import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const ENV_ERROR = "Set MODEL_PROVIDER (openai, anthropic, gateway) and MODEL_ID. See .env.example.";

const saved = {
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  MODEL_ID: process.env.MODEL_ID,
};

afterEach(() => {
  restore("MODEL_PROVIDER", saved.MODEL_PROVIDER);
  restore("MODEL_ID", saved.MODEL_ID);
});

function restore(name: "MODEL_PROVIDER" | "MODEL_ID", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/draft-work-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/draft-work-order", () => {
  it("returns 400 when the body has no email", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await POST(post({}));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Expected { email: string }" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns 500 when MODEL_PROVIDER is unset", async () => {
    delete process.env.MODEL_PROVIDER;
    process.env.MODEL_ID = "gpt-6-luna";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await POST(post({ email: "Leak at 900 Lakeview Blvd" }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: ENV_ERROR });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
