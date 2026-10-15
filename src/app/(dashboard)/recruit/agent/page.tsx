"use client";

import { useRef, useState } from "react";
import { Bot, CornerDownLeft, Loader2 } from "lucide-react";
import DataAgentArtifacts from "@/components/agent/DataAgentArtifacts";
import type { Artifact } from "@/lib/agents/data-agent/tools";

interface AgentResponse {
  rejected: boolean;
  answer: string;
  artifact: Artifact | null;
  meta: { tool: string; rowCount: number } | null;
}

interface Turn {
  id: number;
  question: string;
  answer?: string;
  artifact?: Artifact | null;
  error?: string;
  loading: boolean;
}

const EXAMPLES = [
  "How many candidates came from each source?",
  "Show me the application funnel for all my jobs.",
  "Which source converts best to hires?",
];

export default function DataAgentPage() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    const id = nextId.current++;
    setTurns((prev) => [...prev, { id, question: q, loading: true }]);

    try {
      const res = await fetch("/api/agents/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as AgentResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, loading: false, answer: data.answer, artifact: data.artifact } : t,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, loading: false, error: message } : t)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
          <Bot size={20} className="text-[var(--text)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Ask your hiring data</h1>
          <p className="mt-0.5 text-sm text-white/55">
            Ask in plain language about candidate sources, job funnels, and source performance.
            Every number is read live from your own organisation&rsquo;s data.
          </p>
        </div>
      </header>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => ask(ex)}
              disabled={busy}
              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-3">
            <div className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--text)]">
              {turn.question}
            </div>
            {turn.loading ? (
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Loader2 size={16} className="animate-spin" />
                Reading your data…
              </div>
            ) : turn.error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300">
                {turn.error}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {turn.answer && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                    {turn.answer}
                  </p>
                )}
                {turn.artifact && <DataAgentArtifacts artifact={turn.artifact} />}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[var(--surface,#111)]/80 p-2 backdrop-blur"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your candidates, funnels, or source performance…"
          disabled={busy}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/35 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent,#6366f1)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CornerDownLeft size={16} />}
          Ask
        </button>
      </form>
    </div>
  );
}
