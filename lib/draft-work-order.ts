import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";

import {
  assembleDraft,
  matchProperty,
  ServiceRequestSchema,
  type DraftWorkOrder,
  type IsoDate,
  type LoadProperties,
  type Priority,
  type Problem,
  type PropertyMatch,
  type ReviewFlag,
  type ServiceRequest,
} from "./work-order";

export type DraftDeps = {
  readonly model: LanguageModel;
  readonly loadProperties: LoadProperties;
  readonly today: IsoDate;
};

export type DraftResult =
  | { readonly kind: "drafted"; readonly draft: DraftWorkOrder }
  | { readonly kind: "unreadable" };

const SYSTEM = `You read emails sent to a commercial roofing contractor and extract one roof service request.
Use only facts stated in the email. Use null for anything not stated. Do not guess addresses or phone numbers.
Put the street address in site.address and the building name in site.buildingName.
Copy gate codes, roof hatch locations, and escort rules into accessNotes.`;

type StepFacts =
  | {
      readonly step: "extract";
      readonly ok: true;
      readonly problem: Problem;
      readonly usage: LanguageModelUsage;
    }
  | { readonly step: "extract"; readonly ok: false; readonly error: string }
  | {
      readonly step: "match";
      readonly kind: PropertyMatch["kind"];
      readonly propertyId: string | null;
    }
  | {
      readonly step: "assemble";
      readonly priority: Priority;
      readonly flags: readonly ReviewFlag["code"][];
    };

export async function draftWorkOrder(emailText: string, deps: DraftDeps): Promise<DraftResult> {
  const runId = crypto.randomUUID();
  const request = await extractRequest(emailText, deps, runId);
  if (request === null) return { kind: "unreadable" };

  const matchStarted = performance.now();
  const match = matchProperty(request.site, await deps.loadProperties());
  logStep(runId, matchStarted, {
    step: "match",
    kind: match.kind,
    propertyId: match.kind === "matched" ? match.property.id : null,
  });

  const assembleStarted = performance.now();
  const draft = assembleDraft(request, match, deps.today);
  logStep(runId, assembleStarted, {
    step: "assemble",
    priority: draft.priority,
    flags: draft.flags.map((flag) => flag.code),
  });

  return { kind: "drafted", draft };
}

async function extractRequest(
  emailText: string,
  deps: DraftDeps,
  runId: string,
): Promise<ServiceRequest | null> {
  const started = performance.now();
  try {
    const { output, usage } = await generateText({
      model: deps.model,
      output: Output.object({ schema: ServiceRequestSchema }),
      instructions: SYSTEM,
      prompt: emailText,
    });
    logStep(runId, started, { step: "extract", ok: true, problem: output.problem, usage });
    return output;
  } catch (error) {
    logStep(runId, started, { step: "extract", ok: false, error: errorName(error) });
    if (NoObjectGeneratedError.isInstance(error)) return null;
    throw error;
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

function logStep(runId: string, startedAt: number, { step, ...facts }: StepFacts): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      runId,
      step,
      ms: Math.round(performance.now() - startedAt),
      ...facts,
    }),
  );
}
