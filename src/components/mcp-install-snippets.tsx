"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Check, Copy } from "lucide-react";

// Standalone install-snippet block. Used by both:
//   - The McpPanel inside the AI Build Studio (authors managing their server)
//   - The public /mcp/[slug] detail page (visitors installing the server)
//
// Three tabs: Claude Desktop, Cursor, raw HTTP. Each snippet is auto-
// filled with the actual server URL + a safe slug derived from the name.

export function McpInstallSnippets({ serverName, url }: { serverName: string; url: string }) {
  const [tab, setTab] = useState<"claude" | "cursor" | "raw">("claude");
  const safe = (serverName || "sankofa-build").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sankofa-build";

  const claude = `{
  "mcpServers": {
    "${safe}": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${url}",
        "--header",
        "Authorization: Bearer YOUR_SMCP_TOKEN"
      ]
    }
  }
}`;

  const cursor = `{
  "mcpServers": {
    "${safe}": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer YOUR_SMCP_TOKEN"
      }
    }
  }
}`;

  const raw = `# Bearer-authenticated MCP HTTP server
URL:    ${url}
Header: Authorization: Bearer YOUR_SMCP_TOKEN
Protocol: JSON-RPC 2.0 over POST

# Initialize handshake
curl -X POST "${url}" \\
  -H "Authorization: Bearer YOUR_SMCP_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'`;

  const body = tab === "claude" ? claude : tab === "cursor" ? cursor : raw;
  const file = tab === "claude" ? "~/Library/Application Support/Claude/claude_desktop_config.json"
             : tab === "cursor" ? "~/.cursor/mcp.json"
             : "";

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(["claude", "cursor", "raw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition ${tab === t ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
          >
            {t === "claude" ? "Claude Desktop" : t === "cursor" ? "Cursor" : "Raw HTTP"}
          </button>
        ))}
      </div>
      <McpCodeBlock text={body} />
      {file && <p className="text-[10px] text-muted mt-1.5">Paste into <code className="text-foreground">{file}</code>. Replace <code className="text-foreground">YOUR_SMCP_TOKEN</code> with a token from Sankofa Settings → MCP tokens.</p>}
    </div>
  );
}

function McpCodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-[#06100d] border border-border rounded-lg p-3 text-[10px] font-[family-name:var(--font-mono)] overflow-x-auto whitespace-pre-wrap break-all">{text}</pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="!absolute top-2 right-2 !p-1.5"
        aria-label="Copy snippet"
      >
        {copied ? <Check className="size-3 text-emerald" /> : <Copy className="size-3" />}
      </Button>
    </div>
  );
}
