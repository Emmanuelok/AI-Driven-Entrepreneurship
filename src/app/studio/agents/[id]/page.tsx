"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { Card, Badge, Button, Input, Textarea } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { ArrowLeft, Zap, Play, Copy, Check, Sparkles, Bot } from "lucide-react";
import { useExt } from "@/store/extensions";
import { useStore } from "@/store";
import { useMe } from "@/store/me";

export default function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const found = getAgent(id);
  if (!found) { notFound(); return null; }
  const agent = found;

  const { logAgentRun } = useExt();
  const { addXp } = useStore();
  const { touchConcept, logActivity } = useMe();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setOutput("");
    const t0 = Date.now();
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setOutput(acc);
        }
      }
      logAgentRun(agent.id, inputs, acc, Date.now() - t0);
      addXp(15, `Ran ${agent.name}`);
      touchConcept(agent.name, agent.category, 0.08);
      logActivity({ kind: "agent", title: `Ran ${agent.name}`, href: `/studio/agents/${agent.id}` });
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const ready = agent.inputs.every((f) => (inputs[f.key] ?? "").trim().length > 0);

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
      <Link href="/studio/agents" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> All agents
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div className="text-5xl">{agent.icon}</div>
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge color={agent.color === "emerald" ? "emerald" : agent.color === "amber" ? "amber" : agent.color === "rust" ? "rust" : "indigo"}>{agent.category}</Badge>
            <span className="text-xs text-muted flex items-center gap-1"><Zap className="size-3" /> ~{agent.estSeconds}s</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{agent.name}</h1>
          <p className="text-muted mt-1">{agent.short}</p>
        </div>
      </div>

      <Card className="p-6 mb-4">
        <p className="text-foreground/90 leading-relaxed">{agent.long}</p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h2 className="font-medium mb-4 flex items-center gap-2"><Sparkles className="size-4 text-amber" /> Inputs</h2>
          <div className="space-y-4">
            {agent.inputs.map((f) => (
              <label key={f.key} className="block">
                <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{f.label}</div>
                {f.type === "textarea" ? (
                  <Textarea
                    placeholder={f.placeholder}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                    rows={6}
                  />
                ) : f.type === "select" ? (
                  <select
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
                  >
                    <option value="">Choose…</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input
                    placeholder={f.placeholder}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <Button onClick={run} disabled={!ready || busy} className="mt-5 w-full" size="lg">
            <Play className="size-4" /> {busy ? "Running…" : `Run ${agent.name}`}
          </Button>
        </Card>

        <Card className="p-6 min-h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium flex items-center gap-2"><Bot className="size-4 text-emerald" /> Output</h2>
            {output && (
              <button onClick={copy} className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition">
                {copied ? <><Check className="size-3 text-emerald" /> Copied</> : <><Copy className="size-3" /> Copy</>}
              </button>
            )}
          </div>
          {!output && !busy && (
            <div className="text-center py-16 text-muted text-sm">Fill inputs and run the agent. Output streams here.</div>
          )}
          {busy && !output && (
            <div className="text-center py-16">
              <div className="size-12 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-3 animate-pulse">
                <Bot className="size-6 text-emerald" />
              </div>
              <p className="text-sm text-muted">Agent thinking… typical {agent.estSeconds}s.</p>
            </div>
          )}
          {output && <Markdown src={output} />}
        </Card>
      </div>
    </div>
  );
}
