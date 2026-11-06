# Roofer Agent

Roofer Agent is the starting point for an AI agent that helps a commercial roofing business. The owner's biggest bottleneck is not known yet. This repo holds one synthetic workflow and the experiment records, so the first Build-Measure-Learn loop can start right after the discovery meeting.

The workflow takes a roof-repair email and returns a draft work order. A person must approve every draft. The app sends nothing, saves nothing, and schedules nothing. All buildings, people, and emails in this repo are fictional.

## Run it locally

You need Node.js 22 or later and an API key for one model provider.

1. Install the dependencies.

	```sh
	npm install
	```

2. Copy the example env file. In `.env.local`, set the provider, the model id, and the key for that provider.

	```sh
	cp .env.example .env.local
	```

3. Start the dev server.

	```sh
	npm run dev
	```

4. Open http://localhost:3000. Click **Load sample**, then click **Draft work order**.

## Choose the model

The API route reads two env vars on every request.

| Variable | Value |
| --- | --- |
| `MODEL_PROVIDER` | `openai`, `anthropic`, or `gateway` (Vercel AI Gateway) |
| `MODEL_ID` | A model id for that provider, such as `gpt-6-luna`, `claude-sonnet-5-5`, or `anthropic/claude-sonnet-5.5` for the gateway |

Set the key for the provider you chose: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `AI_GATEWAY_API_KEY`. If `MODEL_PROVIDER` or `MODEL_ID` is missing, the route returns status 500 with a message that names both variables. If the key is missing, the route returns status 500 and the server log shows `AI_LoadAPIKeyError`.

## Check your changes

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs the full pipeline against the AI SDK's `MockLanguageModelV4`. It needs no API key and makes no network calls.

## How a draft is made

The pipeline is plain code with one model call. It is not an agent loop.

1. The model reads the email and returns a service request. `generateText` with `Output.object` checks the reply against `ServiceRequestSchema` in `lib/work-order.ts`. If the reply does not fit the schema, the route returns status 422.
2. `matchProperty` looks up the building in `lib/mock-properties.ts`. It tries the street address first and the building name second. The result is `matched`, `ambiguous`, or `unmatched`.
3. `assembleDraft` sets the priority from the stated urgency, whether water is inside, and the type of problem. Then it runs each check in `REVIEW_CHECKS`. The checks flag an unknown or ambiguous building, an active manufacturer warranty, a repeat of a repair from the last 365 days with its workmanship warranty, and a request with no phone or email.
4. The result is a `DraftWorkOrder`. Its `status` type allows only `pending_approval`.

`lib/draft-work-order.ts` runs these steps and writes one JSON line per step to stdout. All lines for one request share a `runId`. The lines hold step facts and timings, never the email text or contact details.

```json
{"ts":"2026-10-30T21:43:32.133Z","runId":"6ddd62da-a2ac-422a-88e4-023b54b8e871","step":"match","ms":0,"kind":"matched","propertyId":"harbor-point-building-b"}
```

`lib/work-order.ts` imports only `zod`. The pipeline gets building data through one function type, `LoadProperties`. To read buildings from SharePoint through Microsoft Graph, add a file that returns the same `Property` shape and pass it in `app/api/draft-work-order/route.ts`.

## Call the API

```sh
curl -X POST http://localhost:3000/api/draft-work-order \
	-H 'content-type: application/json' \
	-d '{"email":"Water is leaking over dock doors 4 and 5 at 2200 Industrial Pkwy, Riverton. Gate code 4417."}'
```

The route returns one of these responses:

- Status 200 with `{ "kind": "drafted", "draft": { ... } }`.
- Status 422 with `{ "kind": "unreadable" }` when the model reply does not fit the schema.
- Status 400 or 500 with `{ "error": "..." }`.

## Track experiments

- `docs/experiment-ledger.csv` has one row per experiment, with its hypothesis, metric, baseline, success threshold, result, and decision. `EXP-001` is the problem-validation experiment for the discovery meeting.
- `docs/discovery-meeting-questions.md` lists the questions for that meeting and says how to record the answers in `EXP-001`.

## What is left out on purpose

Each item waits until an experiment shows a need for it.

- No database. Drafts are not stored, and the building data is a constant in the repo.
- No SharePoint or Microsoft Graph connection. The first connection should use delegated, read-only access.
- No approval step. Nothing sends email, writes a record, or schedules a crew.
- No authentication. Do not put real customer data in this app.
- No error tracking service such as Sentry. Logs go to stdout.
- No deployment. `npm run build` passes and the app needs no Vercel config file, but it has not been deployed.
- No agent loop, tools, streaming, or evals. One extraction call is enough for this workflow.
