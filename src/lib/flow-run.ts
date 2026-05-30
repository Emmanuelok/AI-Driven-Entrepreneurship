"use client";

import type { FlowNode } from "@/store/flow";
import { aiFetch } from "@/lib/ai-fetch";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";

// Per-node execution. Each kind maps to an existing AI route so we
// don't duplicate prompt-engineering — the flow studio is a different
// surface over the same brain. Returns the output to write into the
// node, or throws on failure (caller marks the node as error).

export async function runNode(node: FlowNode, prompt: string): Promise<NonNullable<FlowNode["output"]>> {
  const t0 = performance.now();
  const siteContext = await buildSiteContextSnapshotAsync(`flow:${node.kind}`);

  switch (node.kind) {
    case "problem":
      // Problem nodes don't call AI — they just carry the user's text
      // (either an Atlas pick or a freeform description). The Run
      // button is a no-op for them but we still set runAt so the UI
      // can show "ready" downstream.
      return { text: prompt.trim(), runAt: Date.now(), durationMs: Math.round(performance.now() - t0) };

    case "note":
      return { text: node.config.text?.trim() ?? "", runAt: Date.now(), durationMs: Math.round(performance.now() - t0) };

    case "persona": {
      // Reuse the interview-script route's persona scaffolding via a
      // prompt-engineered call to ship/synthesize. Returns JSON for
      // structured persona fields.
      const res = await aiFetch(`flow/${node.kind}`, "/api/generate/wedge-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: "",
          region: "",
          userHint: `Generate ONE realistic target customer persona (not 6 wedges) for: ${prompt}. Return JSON with name, role, location, pain.`,
          siteContext,
        }),
      });
      const data = await res.json();
      // The wedge route returns { candidates: [...] }; we synthesize
      // a persona-shaped object from candidate[0].
      const c = (data.candidates ?? [])[0] ?? {};
      const persona = {
        name: c.title?.split(":")[0] ?? "Customer",
        role: c.sector ?? "target",
        location: c.region ?? "",
        pain: c.affected ?? "",
      };
      return {
        text: `${persona.name} · ${persona.role}\nLocation: ${persona.location}\nPain: ${persona.pain}`,
        json: persona,
        runAt: Date.now(),
        durationMs: Math.round(performance.now() - t0),
      };
    }

    case "wedge":
    case "interview":
    case "pitch":
    case "landing": {
      // All four route through /api/ship/synthesize with the kind mapped
      // to the synthesize "kind" param. The synthesize route streams; we
      // collect the full body and write it once.
      const kindMap: Record<string, string> = {
        wedge: "pitch-summary",
        interview: "interview-script",
        pitch: "pitch-summary",
        landing: "landing-copy",
      };
      const res = await aiFetch(`flow/${node.kind}`, "/api/ship/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: kindMap[node.kind],
          ventureName: node.label,
          problem: prompt,
          sliceText: prompt,
          whyMe: "",
          userName: "",
          persona: { name: "target customer", role: "", location: "", pain: "" },
          genomeVoice: "",
          siteContext,
        }),
      });
      const text = await res.text();
      return {
        text: text.trim(),
        runAt: Date.now(),
        durationMs: Math.round(performance.now() - t0),
      };
    }

    case "build": {
      const res = await aiFetch(`flow/${node.kind}`, "/api/build/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentCode: "",
          templateName: "",
          history: [],
          userName: "",
          field: "",
          siteContext,
        }),
      });
      const html = await res.text();
      return {
        text: "Generated HTML — see preview.",
        html,
        runAt: Date.now(),
        durationMs: Math.round(performance.now() - t0),
      };
    }

    case "compose": {
      // Compose is a local synthesis — concatenate every upstream
      // node's output into a venture spec. The actual "Ship to venture"
      // action lives in the UI which calls useStore.createVenture().
      return {
        text: prompt.trim(),
        runAt: Date.now(),
        durationMs: Math.round(performance.now() - t0),
      };
    }
  }
}
