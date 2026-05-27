"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore, Card as SRSCard } from "@/store";
import { Card, Button, Input, Textarea, EmptyState, Stat, Dialog } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { BookMarked, Plus, Flame, Layers, Sparkles, ArrowRight, Trash2 } from "lucide-react";

export default function SrsPage() {
  const { decks, cards, dueCards, addDeck, addCard, reviewCard } = useStore();
  const [reviewing, setReviewing] = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [addingCardTo, setAddingCardTo] = useState<string | null>(null);

  const due = dueCards();
  const stats = useMemo(
    () => ({
      decks: decks.length,
      total: cards.length,
      due: due.length,
      mature: cards.filter((c) => c.interval >= 21).length,
    }),
    [decks, cards, due],
  );

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Daily Review · SRS</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Anki-class spaced repetition. <span className="text-emerald">{due.length}</span> cards due.
          </h1>
          <p className="mt-3 text-muted max-w-2xl">
            We use the SM-2 algorithm — the same engine that powers Anki. Review a few minutes a day; remember things for years.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setCreatingDeck(true)}>
            <Plus className="size-4" /> New deck
          </Button>
          <Button onClick={() => setReviewing(true)} disabled={due.length === 0} size="lg">
            <Sparkles className="size-4" /> Start review
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mb-10">
        <Stat label="Total cards" value={stats.total} color="emerald" />
        <Stat label="Due now" value={stats.due} color="amber" sub="Review to extend the interval" />
        <Stat label="Decks" value={stats.decks} color="indigo" />
        <Stat label="Mature (21+d)" value={stats.mature} color="emerald" sub="Cards you've truly learned" />
      </div>

      {decks.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No decks yet"
          body="Create your first deck — flashcards drive long-term retention. We seed yours with a few starter decks during onboarding."
          action={<Button onClick={() => setCreatingDeck(true)}><Plus className="size-4" /> Create deck</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {decks.map((d) => {
            const deckCards = cards.filter((c) => c.deckId === d.id);
            const deckDue = deckCards.filter((c) => c.due <= Date.now()).length;
            return (
              <Card key={d.id} className="p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <Layers className="size-5 text-emerald" />
                  {deckDue > 0 && (
                    <span className="text-[10px] uppercase tracking-widest text-amber border border-amber/40 bg-amber/5 px-2 py-0.5 rounded-full">
                      {deckDue} due
                    </span>
                  )}
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">{d.name}</h3>
                <p className="mt-1 text-sm text-muted line-clamp-2">{d.description}</p>
                <div className="mt-5 flex items-center justify-between text-xs text-muted">
                  <span>{deckCards.length} cards</span>
                  <button onClick={() => setAddingCardTo(d.id)} className="text-emerald hover:underline">+ Add card</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {reviewing && (
        <ReviewSession
          cards={due}
          onReview={(id, q) => reviewCard(id, q)}
          onClose={() => setReviewing(false)}
        />
      )}

      <Dialog open={creatingDeck} onClose={() => setCreatingDeck(false)} title="New deck">
        <CreateDeckForm
          onCreate={(name, description) => {
            addDeck({ name, description });
            setCreatingDeck(false);
          }}
        />
      </Dialog>

      <Dialog open={addingCardTo !== null} onClose={() => setAddingCardTo(null)} title="Add card">
        {addingCardTo && (
          <CreateCardForm
            onCreate={(front, back) => {
              addCard({ deckId: addingCardTo, front, back });
              setAddingCardTo(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ReviewSession({
  cards,
  onReview,
  onClose,
}: {
  cards: SRSCard[];
  onReview: (id: string, q: 0 | 1 | 2 | 3 | 4 | 5) => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  const c = cards[idx];

  function answer(quality: 0 | 3 | 4 | 5) {
    onReview(c.id, quality);
    if (quality === 0) setCounts((s) => ({ ...s, again: s.again + 1 }));
    else if (quality === 3) setCounts((s) => ({ ...s, hard: s.hard + 1 }));
    else if (quality === 4) setCounts((s) => ({ ...s, good: s.good + 1 }));
    else setCounts((s) => ({ ...s, easy: s.easy + 1 }));
    setRevealed(false);
    if (idx + 1 >= cards.length) setFinished(true);
    else setIdx(idx + 1);
  }

  return (
    <Dialog open={true} onClose={onClose} title={finished ? "Session complete" : `Review ${idx + 1} of ${cards.length}`} size="lg">
      {!finished ? (
        <div>
          <div className="h-1 bg-surface-2 rounded-full mb-6 overflow-hidden">
            <div className="h-full bg-emerald rounded-full transition-all" style={{ width: `${((idx + 1) / cards.length) * 100}%` }} />
          </div>
          <div className="min-h-[200px] flex items-center justify-center text-center p-8 border border-border rounded-2xl bg-surface-2/50">
            <Markdown src={c.front} />
          </div>
          {!revealed ? (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setRevealed(true)} size="lg">Show answer</Button>
            </div>
          ) : (
            <>
              <div className="mt-3 min-h-[200px] flex items-center justify-center text-center p-8 border border-emerald/30 bg-emerald/5 rounded-2xl">
                <Markdown src={c.back} />
              </div>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button variant="danger" onClick={() => answer(0)}>Again</Button>
                <Button variant="secondary" onClick={() => answer(3)}>Hard</Button>
                <Button onClick={() => answer(4)}>Good</Button>
                <Button variant="amber" onClick={() => answer(5)}>Easy</Button>
              </div>
              <p className="text-xs text-muted text-center mt-3">SM-2 will schedule the next review based on your rating.</p>
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="size-20 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-4">
            <Flame className="size-8 text-emerald" />
          </div>
          <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Session done.</h3>
          <p className="mt-2 text-muted">You reviewed {cards.length} cards. Streak preserved.</p>
          <div className="mt-6 grid grid-cols-4 gap-2 max-w-sm mx-auto">
            <SmallStat n={counts.again} l="Again" c="text-rust" />
            <SmallStat n={counts.hard} l="Hard" c="text-amber" />
            <SmallStat n={counts.good} l="Good" c="text-emerald" />
            <SmallStat n={counts.easy} l="Easy" c="text-emerald" />
          </div>
          <Button className="mt-6" onClick={onClose}>Done</Button>
        </div>
      )}
    </Dialog>
  );
}

function SmallStat({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <div>
      <div className={`text-2xl font-mono font-semibold ${c}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{l}</div>
    </div>
  );
}

function CreateDeckForm({ onCreate }: { onCreate: (name: string, description: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="space-y-4">
      <Input placeholder="Deck name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      <div className="flex justify-end">
        <Button onClick={() => name.trim() && onCreate(name, description)} disabled={!name.trim()}>
          Create deck <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CreateCardForm({ onCreate }: { onCreate: (front: string, back: string) => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Front (question / prompt)</div>
        <Textarea placeholder="What does this print?\n\nx = 5; print(x + 3)" value={front} onChange={(e) => setFront(e.target.value)} rows={3} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Back (answer)</div>
        <Textarea placeholder="8 — print evaluates x + 3 to 8" value={back} onChange={(e) => setBack(e.target.value)} rows={3} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => front.trim() && back.trim() && onCreate(front, back)} disabled={!front.trim() || !back.trim()}>
          Add card
        </Button>
      </div>
    </div>
  );
}
