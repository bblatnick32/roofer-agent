import { z } from "zod";

const PROBLEMS = [
  "active_leak",
  "membrane_damage",
  "flashing",
  "drainage",
  "storm_damage",
  "inspection",
  "other",
] as const;

export const ServiceRequestSchema = z.object({
  requester: z.object({
    name: z.string().describe("Person who wrote the email"),
    company: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  site: z.object({
    buildingName: z.string().nullable().describe("Building or site name as written"),
    address: z.string().nullable().describe("Street address of the affected building as written"),
  }),
  problem: z.enum(PROBLEMS),
  waterInside: z.boolean().describe("True only if the email says water is entering the building"),
  urgency: z.enum(["emergency", "soon", "routine"]).describe("The requester's own stated urgency"),
  summary: z.string().describe("One or two plain sentences: what is wrong and where on the roof"),
  accessNotes: z
    .string()
    .nullable()
    .describe("Gate codes, roof hatch, and escort rules, as written"),
});

export type ServiceRequest = z.infer<typeof ServiceRequestSchema>;
export type Problem = ServiceRequest["problem"];

declare const isoDateBrand: unique symbol;
export type IsoDate = string & { readonly [isoDateBrand]: true };

export function isoDate(value: string): IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Expected YYYY-MM-DD, got "${value}"`);
  return value as IsoDate;
}

export function utcIsoDate(date: Date): IsoDate {
  return isoDate(date.toISOString().slice(0, 10));
}

export type RoofSystem =
  | "tpo"
  | "epdm"
  | "pvc"
  | "modified_bitumen"
  | "built_up"
  | "standing_seam_metal";

export type ServiceVisit = {
  readonly date: IsoDate;
  readonly problem: Problem;
  readonly notes: string;
  readonly workmanshipWarrantyUntil: IsoDate | null;
};

export type Property = {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly roof: {
    readonly system: RoofSystem;
    readonly installedYear: number;
    readonly areaSqFt: number | null;
    readonly thicknessMil: number | null;
  };
  readonly warranty: { readonly manufacturer: string; readonly expiresOn: IsoDate } | null;
  readonly history: readonly ServiceVisit[];
};

export type LoadProperties = () => Promise<readonly Property[]>;

export type PropertyMatch =
  | { readonly kind: "matched"; readonly property: Property }
  | { readonly kind: "ambiguous"; readonly candidates: readonly [Property, Property, ...Property[]] }
  | { readonly kind: "unmatched" };

export type Priority = "emergency" | "high" | "normal";

type CheckContext = {
  readonly request: ServiceRequest;
  readonly match: PropertyMatch;
  readonly today: IsoDate;
};

const REPEAT_WINDOW_DAYS = 365;

const PRIORITY_FLOOR: Record<Problem, Priority> = {
  active_leak: "high",
  membrane_damage: "normal",
  flashing: "normal",
  drainage: "normal",
  storm_damage: "high",
  inspection: "normal",
  other: "normal",
};

const STREET_SUFFIXES: Readonly<Record<string, string>> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  blvd: "boulevard",
  pkwy: "parkway",
  dr: "drive",
};

const NAME_STOPWORDS = new Set(["the", "building", "center"]);

const REVIEW_CHECKS = {
  property_unmatched: ({ request, match }: CheckContext): string | null =>
    match.kind === "unmatched" ? `No building on file matches "${siteLabel(request.site)}".` : null,
  property_ambiguous: ({ match }: CheckContext): string | null => {
    if (match.kind !== "ambiguous") return null;
    const names = match.candidates.map((property) => property.name).join(", ");
    return `Matches ${match.candidates.length} buildings: ${names}. Pick one before approving.`;
  },
  warranty_active: ({ match, today }: CheckContext): string | null => {
    if (match.kind !== "matched") return null;
    const warranty = match.property.warranty;
    if (warranty === null || warranty.expiresOn < today) return null;
    return `Under ${warranty.manufacturer} warranty until ${warranty.expiresOn}. Confirm repair terms before dispatch.`;
  },
  repeat_problem: ({ request, match, today }: CheckContext): string | null => {
    if (match.kind !== "matched") return null;
    const visit = latestRepeatVisit(match.property.history, request.problem, today);
    return visit === null ? null : repeatMessage(visit, today);
  },
  no_contact_method: ({ request }: CheckContext): string | null =>
    request.requester.phone === null && request.requester.email === null
      ? "No phone or email to confirm the visit."
      : null,
} satisfies Record<string, (context: CheckContext) => string | null>;

export type ReviewFlag = {
  readonly code: keyof typeof REVIEW_CHECKS;
  readonly message: string;
};

export type DraftWorkOrder = {
  readonly status: "pending_approval";
  readonly priority: Priority;
  readonly request: ServiceRequest;
  readonly property: PropertyMatch;
  readonly flags: readonly ReviewFlag[];
};

export function matchProperty(
  site: ServiceRequest["site"],
  properties: readonly Property[],
): PropertyMatch {
  const addressHits = site.address === null ? [] : propertiesAtAddress(site.address, properties);
  if (addressHits.length > 0) return classifyHits(addressHits);
  const nameHits = site.buildingName === null ? [] : propertiesNamed(site.buildingName, properties);
  return classifyHits(nameHits);
}

export function assembleDraft(
  request: ServiceRequest,
  match: PropertyMatch,
  today: IsoDate,
): DraftWorkOrder {
  return {
    status: "pending_approval",
    priority: priorityFor(request),
    request,
    property: match,
    flags: reviewFlags({ request, match, today }),
  };
}

function priorityFor(request: ServiceRequest): Priority {
  if (request.waterInside) return "emergency";
  switch (request.urgency) {
    case "emergency":
      return "emergency";
    case "soon":
      return "high";
    case "routine":
      return PRIORITY_FLOOR[request.problem];
    default: {
      const exhaustive: never = request.urgency;
      throw new Error(exhaustive);
    }
  }
}

function reviewFlags(context: CheckContext): readonly ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  for (const code of Object.keys(REVIEW_CHECKS) as (keyof typeof REVIEW_CHECKS)[]) {
    const message = REVIEW_CHECKS[code](context);
    if (message !== null) flags.push({ code, message });
  }
  return flags;
}

function siteLabel(site: ServiceRequest["site"]): string {
  return site.address ?? site.buildingName ?? "none given";
}

function latestRepeatVisit(
  history: readonly ServiceVisit[],
  problem: Problem,
  today: IsoDate,
): ServiceVisit | null {
  const earliest = shiftIsoDate(today, -REPEAT_WINDOW_DAYS);
  let latest: ServiceVisit | null = null;
  for (const visit of history) {
    if (visit.problem !== problem || visit.date < earliest || visit.date > today) continue;
    if (latest === null || visit.date > latest.date) latest = visit;
  }
  return latest;
}

function repeatMessage(visit: ServiceVisit, today: IsoDate): string {
  const dated = `Same problem serviced on ${visit.date}.`;
  if (visit.workmanshipWarrantyUntil !== null && visit.workmanshipWarrantyUntil >= today) {
    return `${dated} The repair is under workmanship warranty until ${visit.workmanshipWarrantyUntil}. A reviewer must decide warranty or billable before dispatch.`;
  }
  return dated;
}

function shiftIsoDate(iso: IsoDate, days: number): IsoDate {
  const [year, month, day] = iso.split("-");
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utcIsoDate(utc);
}

function classifyHits(hits: readonly Property[]): PropertyMatch {
  const first = hits[0];
  if (first === undefined) return { kind: "unmatched" };
  const second = hits[1];
  if (second === undefined) return { kind: "matched", property: first };
  return { kind: "ambiguous", candidates: [first, second, ...hits.slice(2)] };
}

function propertiesAtAddress(address: string, properties: readonly Property[]): readonly Property[] {
  const street = streetKey(address);
  if (street.length === 0) return [];
  return properties.filter((property) => hasStreetPrefix(property.address, street));
}

function propertiesNamed(buildingName: string, properties: readonly Property[]): readonly Property[] {
  const needle = nameTokens(buildingName);
  if (needle.length === 0) return [];
  return properties.filter((property) => {
    const haystack = new Set(nameTokens(property.name));
    return needle.every((token) => haystack.has(token));
  });
}

function streetKey(address: string): string {
  return normalize(address.split(",")[0] ?? "");
}

function hasStreetPrefix(address: string, street: string): boolean {
  const normalized = normalize(address);
  if (!normalized.startsWith(street)) return false;
  const next = normalized.charAt(street.length);
  return next === "" || next === " ";
}

function nameTokens(value: string): readonly string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 0 && !NAME_STOPWORDS.has(token));
}

function normalize(value: string): string {
  return withoutUnitDesignators(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => STREET_SUFFIXES[token] ?? token)
    .join(" ");
}

function withoutUnitDesignators(value: string): string {
  return value
    .replace(/\b(?:suite|ste|unit|apt)\s+[a-z0-9-]+\b/gi, " ")
    .replace(/#\s*[a-z0-9-]+/gi, " ");
}
