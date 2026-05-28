// Embedding provider abstraction. Voyage AI is the default (cheap +
// multilingual, good for African student traffic). Falls back to
// deterministic hash-based pseudo-embeddings in local mode so the
// search UI still works without an API key.

const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";
const DIM = 1024;

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (VOYAGE_KEY) {
    try {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE_KEY}` },
        body: JSON.stringify({ input: texts.slice(0, 128), model: VOYAGE_MODEL, input_type: "document" }),
      });
      if (res.ok) {
        const data = await res.json();
        const vectors: number[][] = (data.data ?? []).map((d: { embedding: number[] }) => d.embedding);
        if (vectors.length === texts.length) return vectors;
      }
    } catch {
      // fall through to local
    }
  }

  // Local fallback: deterministic, low-quality, just so the pipeline
  // returns *something*. Hash each token to a slot, count occurrences,
  // L2-normalize. Won't find semantic neighbours, but exact-match works.
  return texts.map(localPseudoEmbedding);
}

function localPseudoEmbedding(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const t of tokens) {
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
    v[h % DIM] += 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}
