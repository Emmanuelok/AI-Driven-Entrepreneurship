// Pure decision logic for whether one member may send a cold contact
// request to another, given the recipient's contact_policy. Extracted
// so the rule is unit-testable and identical on every call site (the
// send API enforces it server-side; the UI uses it to show/hide the
// composer).

export type ContactPolicy = "open" | "institution" | "closed";

export type ContactGateInput = {
  policy: ContactPolicy;
  isSelf: boolean;
  // Whether sender and recipient share an institution. Only consulted
  // for the 'institution' policy. Caller computes the match (it's a
  // fuzzy, app-owned comparison).
  sameInstitution: boolean;
  // Whether the recipient's profile is public at all. A private profile
  // is never contactable through this channel.
  recipientPublic: boolean;
};

export type ContactGateResult =
  | { allowed: true }
  | { allowed: false; reason: "self" | "not_public" | "closed" | "institution_only" };

export function canContact(input: ContactGateInput): ContactGateResult {
  if (input.isSelf) return { allowed: false, reason: "self" };
  if (!input.recipientPublic) return { allowed: false, reason: "not_public" };
  switch (input.policy) {
    case "closed":
      return { allowed: false, reason: "closed" };
    case "institution":
      return input.sameInstitution
        ? { allowed: true }
        : { allowed: false, reason: "institution_only" };
    case "open":
      return { allowed: true };
    default:
      // Unknown policy → fail closed.
      return { allowed: false, reason: "closed" };
  }
}

// Human-readable explanation for a blocked gate — surfaced in the UI
// and as the API error message.
export function contactBlockReason(reason: Exclude<ContactGateResult, { allowed: true }>["reason"]): string {
  switch (reason) {
    case "self":
      return "You can't send a contact request to yourself.";
    case "not_public":
      return "This member isn't accepting contact right now.";
    case "closed":
      return "This member has closed inbound contact requests.";
    case "institution_only":
      return "This member only accepts contact from people at the same institution.";
    default:
      return "Contact isn't available.";
  }
}

// Best-effort institution match: case-insensitive, trimmed, and tolerant
// of one being a prefix/substring of the other (e.g. "KNUST" vs
// "Kwame Nkrumah University of Science and Technology (KNUST)"). Empty
// on either side means no match (we don't treat "unknown" as "same").
export function institutionsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}
