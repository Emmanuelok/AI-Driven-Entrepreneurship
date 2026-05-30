// Single entry point for parsing + validating JSON request bodies on
// API routes. Pairs with aiGuard: where aiGuard prevents an unauthed
// route from burning your budget, parseBody prevents a malformed body
// from crashing the route or letting bad data through.
//
// Usage:
//
//   const ProblemNodeBody = z.object({
//     prompt: z.string().min(1).max(8000),
//     scope: z.string().optional(),
//   });
//
//   const parsed = await parseBody(req, ProblemNodeBody);
//   if (!parsed.ok) return parsed.response;
//   const body = parsed.data;
//
// Returns a tagged result instead of throwing so route handlers stay
// linear. The error response is shaped like the rate-limit + quota
// errors elsewhere (a stable {ok:false, error, …} payload).

import type { z } from "zod";
import { ZodError } from "zod";

export type ParseBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<ParseBodyResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "invalid_json", message: "Request body wasn't valid JSON." },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // Flatten the zod issues into a stable shape the client can render.
    // We don't leak the schema itself; just per-path messages.
    const issues = result.error.issues.map((i: ZodError["issues"][number]) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "invalid_body",
          message: "Some fields didn't match what this route expects.",
          issues,
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data };
}

// Variant that ALSO returns the raw parsed JSON alongside the validated
// data — useful for routes that read siteContext directly off the body
// (it's part of the contract but not part of the schema of the route's
// own fields).
export async function parseBodyWithRaw<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ParseBodyResult<T> & { ok: true; raw: unknown } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "invalid_json", message: "Request body wasn't valid JSON." },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i: ZodError["issues"][number]) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "invalid_body", message: "Some fields didn't match what this route expects.", issues },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data, raw };
}
