"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui";
import { Bell, BellOff, AlertCircle } from "lucide-react";

// Push-notifications opt-in. Requires:
//   1. Service worker registered (production only, see ServiceWorker.tsx)
//   2. NEXT_PUBLIC_VAPID_PUBLIC_KEY env var
//   3. User signed in (subscription is stored server-side per user)

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function PushToggle() {
  const [supported, setSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch { /* noop */ }
    })();
  }, []);

  async function enable() {
    setBusy(true); setError(null);
    try {
      if (!VAPID_KEY) {
        setError("Push isn't wired on this deployment yet — admin needs to set NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
        return;
      }
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync required for push notifications."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { setError("You denied notifications. Re-enable in your browser settings to retry."); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) { setError("Subscription failed."); return; }

      const res = await fetch("/api/notify/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Couldn't save subscription."); return; }
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const sb = supabaseBrowser();
        const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
        await sub.unsubscribe();
        if (session) {
          await fetch(`/api/notify/push-subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  async function testPush() {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch("/api/notify/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ title: "Sankofa", body: "Push is wired. You'll get nudges on deadlines and weekly digests.", url: "/studio" }),
    });
  }

  if (!supported) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <AlertCircle className="size-3.5" /> This browser doesn&apos;t support push notifications.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          {subscribed ? (
            <span className="flex items-center gap-2 text-emerald"><Bell className="size-4" /> Push notifications enabled on this device.</span>
          ) : (
            <span className="flex items-center gap-2 text-muted"><BellOff className="size-4" /> Get weekly digest, deadline alerts, and synth-ready pings.</span>
          )}
        </div>
        <div className="flex gap-2">
          {subscribed ? (
            <>
              <Button variant="ghost" onClick={testPush} disabled={busy}>Test</Button>
              <Button variant="secondary" onClick={disable} disabled={busy}>{busy ? "…" : "Disable"}</Button>
            </>
          ) : (
            <Button onClick={enable} disabled={busy || permission === "denied"}>
              <Bell className="size-4" /> {busy ? "Enabling…" : "Enable push"}
            </Button>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>}
      {permission === "denied" && !error && (
        <div className="text-xs text-muted">Your browser previously blocked notifications. Re-allow them in site settings, then return here.</div>
      )}
    </div>
  );
}

// VAPID public key conversion — browser PushManager expects a UInt8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
