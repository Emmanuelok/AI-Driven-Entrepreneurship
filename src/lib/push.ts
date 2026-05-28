import webpush from "web-push";

// Web Push helper. Configured with VAPID keys from env. Gracefully
// no-ops when keys are missing so dev can still build.
//
// Generate keys once:
//   npx web-push generate-vapid-keys
// Then set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY +
// VAPID_SUBJECT (mailto:you@example.com) on the project.

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@sankofa.studio";

let configured = false;
function ensure() {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
  return true;
}

export function isPushConfigured() {
  return !!PUBLIC && !!PRIVATE;
}

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string; tag?: string; icon?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!ensure()) return { ok: false, error: "vapid_not_configured" };
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || "/studio",
        tag: payload.tag,
        icon: payload.icon || "/icon.svg",
      }),
    );
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    return { ok: false, error: `${err.statusCode ?? ""} ${err.body ?? err.message ?? "send failed"}`.trim() };
  }
}
