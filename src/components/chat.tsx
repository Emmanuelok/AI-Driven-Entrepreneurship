"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Globe2, Mic, Brain } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useStore } from "@/store";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatPanel({
  endpoint,
  coachName = "Sage",
  coachShort = "Always-on AI tutor",
  starters,
  intro,
  iconBg = "from-emerald to-emerald-deep",
}: {
  endpoint: string;
  coachName?: string;
  coachShort?: string;
  starters: string[];
  intro: string;
  iconBg?: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"live" | "demo" | "unknown">("unknown");
  const { preferences, addXp } = useStore();
  const [language, setLanguage] = useState(preferences.language);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: { language } }),
      });
      const detected = res.headers.get("x-mode") ?? res.headers.get("x-sage-mode");
      if (detected === "live" || detected === "demo") setMode(detected);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMsgs((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
        }
      }
      addXp(8, `Conversation with ${coachName}`);
    } catch (err) {
      setMsgs((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = {
          role: "assistant",
          content: `_Connection hiccup. ${(err as Error).message}_`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <header className="border-b border-border px-5 sm:px-8 py-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className={`size-11 rounded-2xl bg-gradient-to-br ${iconBg} flex items-center justify-center shadow-lg shadow-emerald/20`}>
            <Brain className="size-5 text-black" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-xl font-semibold">{coachName}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${mode === "live" ? "text-emerald border border-emerald/40 bg-emerald/5" : "text-amber border border-amber/40 bg-amber/5"}`}>
                <span className={`size-1.5 rounded-full ${mode === "live" ? "bg-emerald" : "bg-amber"} ${mode === "live" ? "pulse-dot" : ""}`} />
                {mode === "live" ? "Live · Claude" : mode === "demo" ? "Demo mode" : "Connecting…"}
              </span>
            </div>
            <div className="text-xs text-muted">{coachShort}</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-surface border border-border">
          <Globe2 className="size-3.5 text-emerald" />
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-transparent outline-none">
            {["English", "Pidgin", "Twi", "Yoruba", "Hausa", "Swahili", "Amharic", "French", "Wolof", "Zulu"].map((l) => (
              <option key={l} value={l} className="bg-surface">{l}</option>
            ))}
          </select>
        </label>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-6">
          {msgs.length === 0 && (
            <div className="text-center py-12">
              <div className={`size-16 mx-auto rounded-3xl bg-gradient-to-br ${iconBg} flex items-center justify-center shadow-xl shadow-emerald/30 mb-6 float`}>
                <Sparkles className="size-7 text-black" />
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{coachName}</h2>
              <p className="mt-3 text-muted max-w-md mx-auto leading-relaxed">{intro}</p>
              <div className="mt-8 grid sm:grid-cols-2 gap-2 text-left">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="glass rounded-xl px-4 py-3 text-sm hover:border-emerald/50 transition text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <Bubble key={i} m={m} streaming={busy && i === msgs.length - 1 && m.role === "assistant"} iconBg={iconBg} />
          ))}
        </div>
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="glass rounded-2xl flex items-end gap-2 p-2 pl-4"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={busy ? `${coachName} is thinking…` : `Ask ${coachName} anything…`}
              rows={1}
              disabled={busy}
              className="flex-1 bg-transparent resize-none outline-none py-2 placeholder:text-muted text-foreground max-h-40"
            />
            <button type="button" className="size-10 rounded-xl text-muted hover:text-foreground hover:bg-surface-2 transition flex items-center justify-center" title="Voice (coming soon)">
              <Mic className="size-4" />
            </button>
            <button type="submit" disabled={busy || !input.trim()} className="size-10 rounded-xl bg-emerald text-black hover:bg-amber disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, streaming, iconBg }: { m: Msg; streaming: boolean; iconBg: string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-emerald/15 border border-emerald/30 text-foreground rounded-2xl rounded-tr-sm px-4 py-3">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <div className={`size-8 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center shrink-0`}>
        <Brain className="size-4 text-black" />
      </div>
      <div className="flex-1 min-w-0 glass rounded-2xl rounded-tl-sm px-5 py-4">
        <Markdown src={m.content} />
        {streaming && (
          <div className="mt-2 flex gap-1">
            <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
            <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.15s" }} />
            <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.3s" }} />
          </div>
        )}
      </div>
    </div>
  );
}
