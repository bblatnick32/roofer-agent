import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";
import { z } from "zod";

import { draftWorkOrder } from "../../../lib/draft-work-order";
import { loadMockProperties } from "../../../lib/mock-properties";
import { utcIsoDate } from "../../../lib/work-order";

const BodySchema = z.object({
  email: z.string().trim().min(1).max(20_000),
});

const PROVIDERS = ["openai", "anthropic", "gateway"] as const;

const EnvSchema = z.object({
  MODEL_PROVIDER: z.enum(PROVIDERS),
  MODEL_ID: z.string().min(1),
});

const ENV_ERROR = `Set MODEL_PROVIDER (${PROVIDERS.join(", ")}) and MODEL_ID. See .env.example.`;

type ModelEnv = z.infer<typeof EnvSchema>;

function languageModelFromEnv(env: ModelEnv): LanguageModel {
  switch (env.MODEL_PROVIDER) {
    case "openai":
      return openai(env.MODEL_ID);
    case "anthropic":
      return anthropic(env.MODEL_ID);
    case "gateway":
      return gateway(env.MODEL_ID);
    default: {
      const neverProvider: never = env.MODEL_PROVIDER;
      throw new Error(neverProvider);
    }
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Expected { email: string }" }, { status: 400 });
  }

  const env = EnvSchema.safeParse({
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
    MODEL_ID: process.env.MODEL_ID,
  });
  if (!env.success) {
    return Response.json({ error: ENV_ERROR }, { status: 500 });
  }

  const result = await draftWorkOrder(body.data.email, {
    model: languageModelFromEnv(env.data),
    loadProperties: loadMockProperties,
    today: utcIsoDate(new Date()),
  });

  switch (result.kind) {
    case "drafted":
      return Response.json(result, { status: 200 });
    case "unreadable":
      return Response.json(result, { status: 422 });
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
