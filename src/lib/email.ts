import { Resend } from "resend";

// Email sender. Real Resend when RESEND_API_KEY is set; no-op
// returning {ok:true, mode:"local"} otherwise so callers never error.
//
// Set RESEND_API_KEY + SANKOFA_FROM_EMAIL (e.g. "Sankofa <noreply@sankofa.studio>")
// in env to flip on real delivery. Add the from-domain to Resend's
// verified domains list first.

export type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;     // plain-text fallback (auto-derived from html if absent)
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

const FROM = process.env.SANKOFA_FROM_EMAIL || "Sankofa <noreply@sankofa.studio>";

export async function sendEmail(p: EmailPayload): Promise<{ ok: boolean; id?: string; mode: "live" | "local"; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[email] (local mode) would send:", { to: p.to, subject: p.subject });
    }
    return { ok: true, mode: "local" };
  }

  const text = p.text ?? p.html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: p.to,
      subject: p.subject,
      html: p.html,
      text,
      replyTo: p.replyTo,
      tags: p.tags,
    });
    if (error) return { ok: false, mode: "live", error: String(error.message ?? error) };
    return { ok: true, id: data?.id, mode: "live" };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}

// Sankofa house-style HTML wrapper. Wraps body content in our dark
// palette so emails feel like part of the platform.
export function emailShell(opts: { heading: string; body: string; cta?: { href: string; label: string }; footer?: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body { margin:0; background:#0a0f0d; color:#e7efe9; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:560px; margin:32px auto; padding:0 20px; }
  .card { background:#141d1a; border:1px solid #2a3a35; border-radius:18px; padding:32px; }
  h1 { font-size:24px; line-height:1.2; margin:0 0 18px; }
  p { color:#cfe0d8; line-height:1.6; font-size:15px; margin:8px 0; }
  .cta { display:inline-block; background:#2cc295; color:#000 !important; text-decoration:none; font-weight:600; padding:12px 22px; border-radius:999px; margin-top:18px; }
  .footer { color:#6b8079; font-size:12px; margin-top:24px; text-align:center; }
  .brand { color:#2cc295; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; font-size:11px; }
</style></head>
<body>
  <div class="wrap">
    <div class="brand" style="margin-bottom:14px;">Sankofa Studio</div>
    <div class="card">
      <h1>${escapeHtml(opts.heading)}</h1>
      <div>${opts.body}</div>
      ${opts.cta ? `<a class="cta" href="${escapeHtml(opts.cta.href)}">${escapeHtml(opts.cta.label)}</a>` : ""}
    </div>
    <div class="footer">${opts.footer ?? "You receive this because you're building on Sankofa Studio."}<br/>Local-first by design — every byte of your work also lives on your device.</div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]!));
}
