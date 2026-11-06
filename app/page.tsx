"use client";

import { useState, type FormEvent } from "react";

import type { DraftResult } from "../lib/draft-work-order";
import { SAMPLE_EMAIL } from "../lib/sample-email";
import type {
  DraftWorkOrder,
  Priority,
  Problem,
  Property,
  PropertyMatch,
  RoofSystem,
  ServiceVisit,
} from "../lib/work-order";

type View =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; result: DraftResult }
  | { kind: "failed"; status: number; error: string | null };

export default function Page() {
  const [email, setEmail] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setView({ kind: "pending" });
    try {
      const res = await fetch("/api/draft-work-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 200 || res.status === 422) {
        setView({ kind: "done", result: (await res.json()) as DraftResult });
        return;
      }
      setView({ kind: "failed", status: res.status, error: await readError(res) });
    } catch {
      setView({
        kind: "failed",
        status: 0,
        error: "Server error. Check the server log.",
      });
    }
  }

  return (
    <main>
      <h1>Roofer Agent</h1>
      <p className="lede">Paste a roof-repair email and draft a work order.</p>
      <div className="workspace">
        <form onSubmit={(event) => void onSubmit(event)}>
          <label htmlFor="roof-email">Roof repair email</label>
          <textarea
            id="roof-email"
            name="email"
            value={email}
            placeholder="Paste a roof-repair email"
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="actions">
            <button type="button" onClick={() => setEmail(SAMPLE_EMAIL)}>
              Load sample
            </button>
            <button type="submit" className="primary" disabled={view.kind === "pending"}>
              Draft work order
            </button>
          </div>
        </form>
        <div className="result" aria-live="polite">
          <ViewBody view={view} />
        </div>
      </div>
    </main>
  );
}

function ViewBody({ view }: { view: View }) {
  switch (view.kind) {
    case "idle":
      return <p className="quiet">The draft will show up here.</p>;
    case "pending":
      return <p>Drafting the work order.</p>;
    case "failed":
      return <p role="alert">{view.error ?? `Server error ${view.status}. Check the server log.`}</p>;
    case "done":
      return <DoneBody result={view.result} />;
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

function DoneBody({ result }: { result: DraftResult }) {
  switch (result.kind) {
    case "unreadable":
      return <p role="alert">Could not read a roof service request from that email.</p>;
    case "drafted":
      return <DraftBody draft={result.draft} />;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

function DraftBody({ draft }: { draft: DraftWorkOrder }) {
  const { requester } = draft.request;
  const contact = [requester.phone, requester.email].filter((part) => part !== null);
  return (
    <article>
      <p className="banner">Pending approval. Nothing has been sent, saved, or scheduled.</p>
      <dl>
        <div>
          <dt>Priority</dt>
          <dd>{PRIORITY_LABELS[draft.priority]}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>
            {requester.name}
            {requester.company === null ? "" : `, ${requester.company}`}
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>{contact.length === 0 ? "No phone or email." : contact.join(", ")}</dd>
        </div>
        <div>
          <dt>Problem</dt>
          <dd>{PROBLEM_LABELS[draft.request.problem]}</dd>
        </div>
        <div>
          <dt>Summary</dt>
          <dd>{draft.request.summary}</dd>
        </div>
        <div>
          <dt>Access notes</dt>
          <dd>{draft.request.accessNotes ?? "None stated."}</dd>
        </div>
      </dl>
      <PropertySection match={draft.property} />
      <h2>Review</h2>
      {draft.flags.length === 0 ? (
        <p>No review flags.</p>
      ) : (
        <ul className="flags">
          {draft.flags.map((flag) => (
            <li key={flag.code}>{flag.message}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PropertySection({ match }: { match: PropertyMatch }) {
  switch (match.kind) {
    case "matched":
      return <MatchedProperty property={match.property} />;
    case "ambiguous":
      return (
        <section>
          <h2>Property</h2>
          <ul>
            {match.candidates.map((property) => (
              <li key={property.id}>{property.name}</li>
            ))}
          </ul>
        </section>
      );
    case "unmatched":
      return (
        <section>
          <h2>Property</h2>
          <p>No building on file matches this email.</p>
        </section>
      );
    default: {
      const exhaustive: never = match;
      return exhaustive;
    }
  }
}

function MatchedProperty({ property }: { property: Property }) {
  return (
    <section>
      <h2>Property</h2>
      <p className="building">{property.name}</p>
      <p>{property.address}</p>
      <p>{roofSummary(property.roof)}</p>
      <p>{warrantyLine(property.warranty)}</p>
      <h2>Service history</h2>
      {property.history.length === 0 ? (
        <p>No visits on file.</p>
      ) : (
        <ul>
          {property.history.map((visit) => (
            <li key={`${visit.date}-${visit.problem}`}>{visitLine(visit)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function readError(res: Response): Promise<string | null> {
  const payload: unknown = await res.json().catch(() => null);
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return null;
  return typeof payload.error === "string" ? payload.error : null;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  emergency: "Emergency",
  high: "High",
  normal: "Normal",
};

const PROBLEM_LABELS: Record<Problem, string> = {
  active_leak: "Active leak",
  membrane_damage: "Membrane damage",
  flashing: "Flashing",
  drainage: "Drainage",
  storm_damage: "Storm damage",
  inspection: "Inspection",
  other: "Other",
};

const ROOF_LABELS: Record<RoofSystem, string> = {
  tpo: "TPO",
  epdm: "EPDM",
  pvc: "PVC",
  modified_bitumen: "Modified bitumen",
  built_up: "Built-up",
  standing_seam_metal: "Standing-seam metal",
};

function roofSummary(roof: Property["roof"]): string {
  const parts = [ROOF_LABELS[roof.system]];
  if (roof.thicknessMil !== null) parts.push(`${roof.thicknessMil} mil`);
  parts.push(`installed ${roof.installedYear}`);
  if (roof.areaSqFt !== null) parts.push(`${roof.areaSqFt.toLocaleString("en-US")} sq ft`);
  return parts.join(", ");
}

function warrantyLine(warranty: Property["warranty"]): string {
  if (warranty === null) return "No manufacturer warranty on file.";
  return `${warranty.manufacturer} warranty until ${warranty.expiresOn}.`;
}

function visitLine(visit: ServiceVisit): string {
  if (visit.workmanshipWarrantyUntil === null) return `${visit.date}. ${visit.notes}`;
  return `${visit.date}. ${visit.notes} Workmanship warranty until ${visit.workmanshipWarrantyUntil}.`;
}
