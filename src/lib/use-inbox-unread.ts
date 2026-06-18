"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { profileApi } from "@/lib/profile-api";

// Live unread-count of received contact requests, for the Inbox nav
// badge. Fetches once on mount, re-fetches when `deps` change (we pass
// the pathname so navigating around keeps it fresh — including landing
// on /studio/inbox which marks everything read), and subscribes to
// realtime INSERTs addressed to the current user so a brand-new
// request bumps the badge without a refresh.
export function useInboxUnread(refreshKey?: string): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await profileApi.getContacts(false);
      if (!cancelled && r.ok) setUnread(r.unread);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    let channel: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      const { data } = await sb.auth.getSession();
      const me = data.session?.user.id;
      if (!me) return;
      channel = sb.channel(`profile-contacts:${me}`);
      channel.on(
        "postgres_changes" as never,
        { event: "INSERT", schema: "public", table: "profile_contacts", filter: `to_user_id=eq.${me}` },
        () => setUnread((n) => n + 1),
      );
      channel.subscribe();
    })();
    return () => { if (channel) void sb.removeChannel(channel); };
  }, []);

  return unread;
}
