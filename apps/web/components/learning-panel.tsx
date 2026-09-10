"use client";
import { useState, type FormEvent } from "react";
import { Search, BookOpen, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
type Case = {
  id: string;
  title: string;
  ageMin: number;
  ageMax: number;
  sex: string;
  narrative: string;
  concepts: string[];
  labPatterns: string[];
  treatment: string;
  outcome: string;
  score: number;
  matchedTerms: string[];
  matchExplanation: string;
};
export function LearningPanel() {
  const [query, setQuery] = useState(""),
    [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [ack, setAck] = useState(false),
    [results, setResults] = useState<Case[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false);
  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api<{ results: Case[] }>("/learning/cases/search", {
        method: "POST",
        body: {
          query,
          ...(min ? { ageMin: Number(min) } : {}),
          ...(max ? { ageMax: Number(max) } : {}),
          purpose: "clinical-learning",
          acknowledgeLimitations: ack,
        },
      });
      setResults(d.results);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Explore synthetic clinical cases</h2>
            <p>A separate fictional corpus. No patient records are included.</p>
          </div>
          <BookOpen size={22} />
        </div>
        <form className="learning-form" onSubmit={search}>
          <label>
            Symptoms, concepts, or laboratory patterns
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={500}
              placeholder="e.g. fever, rash, elevated CRP"
            />
          </label>
          <div className="form-columns">
            <label>
              Minimum age
              <Input
                value={min}
                onChange={(e) => setMin(e.target.value)}
                type="number"
                min={0}
                max={120}
              />
            </label>
            <label>
              Maximum age
              <Input
                value={max}
                onChange={(e) => setMax(e.target.value)}
                type="number"
                min={0}
                max={120}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <Checkbox
              checked={ack}
              onCheckedChange={(v) => setAck(v === true)}
            />
            I understand that similarity is not a diagnosis or treatment
            recommendation.
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <Button className="primary-button" disabled={!ack || busy}>
            <Search size={17} />
            {busy ? "Searching…" : "Search fictional cases"}
          </Button>
        </form>
      </section>
      {results.map((c) => (
        <article className="panel case-card" key={c.id}>
          <div className="case-heading">
            <span className="status-pill neutral">{c.id} · Synthetic</span>
            <span className="field-help">Ranking score: {c.score}</span>
          </div>
          <h2>{c.title}</h2>
          <p className="field-help">
            Age {c.ageMin}–{c.ageMax} · {c.sex}
          </p>
          <p>{c.narrative}</p>
          <dl className="detail-grid">
            <div>
              <dt>Treatment in this fictional case</dt>
              <dd>{c.treatment}</dd>
            </div>
            <div>
              <dt>Reported outcome</dt>
              <dd>{c.outcome}</dd>
            </div>
          </dl>
          <div className="case-match">
            <ShieldCheck size={17} />
            <div>
              <strong>
                Matched concepts:{" "}
                {c.matchedTerms.join(", ") || "Structured filters only"}
              </strong>
              <p>{c.matchExplanation}</p>
            </div>
          </div>
        </article>
      ))}
      {searched && !results.length && (
        <section className="panel">
          <div className="empty-state">
            <h3>No matching cases</h3>
            <p>
              Try a broader query or age range. Only this limited synthetic
              corpus is searched.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
export function SourceSummary({
  patientId,
  onOpen,
}: {
  patientId: string;
  onOpen: (id: string) => void;
}) {
  const [statements, setStatements] = useState<
      { text: string; sourceRecordId: string; source: string }[] | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Source-linked record review</h2>
          <p>
            Excerpts from your permitted active records. No clinical inference.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!patientId || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = await api<{
                statements: {
                  text: string;
                  sourceRecordId: string;
                  source: string;
                }[];
              }>(`/patients/${patientId}/summary`);
              setStatements(d.statements);
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Review unavailable");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Loading…" : "Review sources"}
          <ArrowRight size={16} />
        </Button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {statements?.map((s) => (
        <div className="summary-row" key={s.sourceRecordId}>
          <p>{s.text}</p>
          <button
            className="text-button"
            onClick={() => onOpen(s.sourceRecordId)}
          >
            View source · {s.source}
            <ArrowRight size={14} />
          </button>
        </div>
      ))}
      {statements?.length === 0 && (
        <p className="summary-row muted">No active records in this view.</p>
      )}
    </section>
  );
}
