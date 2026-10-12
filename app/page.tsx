"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  parseSavedQuest,
  type Company,
  type DurationMinutes,
  type Energy,
  type Environment,
  type Focus,
  type QuestPreferences,
  type QuestResponse,
} from "@/lib/quest";

type Stage = "landing" | "personalize" | "generating" | "card" | "outside" | "reflect";

const QUEST_KEY = "microwild.v1.quest";
const REFLECTION_KEY = "microwild.v1.reflection";

interface SavedQuest {
  response: QuestResponse;
  prefs: QuestPreferences;
  savedAt: string;
}

interface SavedReflection {
  text: string;
  questTitle: string;
  savedAt: string;
}

function loadQuest(): SavedQuest | null {
  try {
    return parseSavedQuest(localStorage.getItem(QUEST_KEY));
  } catch {
    return null;
  }
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="choices">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className="choice"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("landing");
  const [prefs, setPrefs] = useState<QuestPreferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState<SavedQuest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reflection, setReflection] = useState("");
  const [reflectionSaved, setReflectionSaved] = useState(false);

  useEffect(() => {
    setSaved(loadQuest());
    try {
      const r = localStorage.getItem(REFLECTION_KEY);
      if (r) {
        const parsed = JSON.parse(r) as SavedReflection;
        if (parsed.text) setReflection(parsed.text);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const set = <K extends keyof QuestPreferences>(k: K, v: QuestPreferences[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/quest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      if (!res.ok) throw new Error(`Server error (${res.status}).`);
      const data = (await res.json()) as QuestResponse;
      if (!data?.quest || data.quest.steps?.length !== 3) throw new Error("Invalid quest received.");
      const entry: SavedQuest = {
        response: data,
        prefs,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(QUEST_KEY, JSON.stringify(entry));
      } catch {
        /* storage full or unavailable; quest still shown */
      }
      setSaved(entry);
      setStage("card");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a quest.");
    } finally {
      setGenerating(false);
    }
  }, [prefs]);

  const openSaved = useCallback(() => {
    const entry = loadQuest();
    if (entry) {
      setSaved(entry);
      setStage("card");
    }
  }, []);

  const saveReflection = useCallback(() => {
    const entry: SavedReflection = {
      text: reflection.trim(),
      questTitle: saved?.response.quest.title ?? "",
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(REFLECTION_KEY, JSON.stringify(entry));
      setReflectionSaved(true);
    } catch {
      setError("Could not save: storage unavailable.");
    }
  }, [reflection, saved]);

  const quest = saved?.response.quest ?? null;
  const source = saved?.response.source ?? null;

  return (
    <div className="wrap">
      <header className="masthead">
        <p className="brand">MicroWild</p>
      </header>

      {stage === "landing" && (
        <main>
          <h1 className="title">Find the wild in the places you already are.</h1>
          <p className="lede">
            MicroWild turns an ordinary street, courtyard, or park into a short, personal nature
            quest — generated for your time, energy, and surroundings.
          </p>
          <p className="small">
            The whole point is to spend <em>less</em> time on the screen: get your quest, put the
            phone away, and look closely at the world for a few minutes.
          </p>
          <button className="btn" onClick={() => setStage("personalize")}>
            Create my quest
          </button>
          {saved && (
            <button className="btn secondary" onClick={openSaved}>
              Continue saved quest: {saved.response.quest.title}
            </button>
          )}
        </main>
      )}

      {stage === "personalize" && (
        <main>
          <h1 className="title">Shape your quest.</h1>
          <p className="lede">Five quick choices. Nothing else is needed.</p>
          <Choice<DurationMinutes>
            label="Available time"
            value={prefs.durationMinutes}
            onChange={(v) => set("durationMinutes", v)}
            options={[
              { value: 5, text: "5 minutes" },
              { value: 10, text: "10 minutes" },
              { value: 15, text: "15 minutes" },
            ]}
          />
          <Choice<Energy>
            label="Energy"
            value={prefs.energy}
            onChange={(v) => set("energy", v)}
            options={[
              { value: "gentle", text: "Gentle" },
              { value: "moderate", text: "Moderate" },
              { value: "active", text: "Active" },
            ]}
          />
          <Choice<Environment>
            label="Environment"
            value={prefs.environment}
            onChange={(v) => set("environment", v)}
            options={[
              { value: "street", text: "Street / sidewalk" },
              { value: "residential", text: "Residential area" },
              { value: "courtyard", text: "Courtyard" },
              { value: "park", text: "Park" },
            ]}
          />
          <Choice<Focus>
            label="What to notice"
            value={prefs.focus}
            onChange={(v) => set("focus", v)}
            options={[
              { value: "life", text: "Tiny signs of life" },
              { value: "light", text: "Light and shadows" },
              { value: "patterns", text: "Patterns and textures" },
              { value: "mixed", text: "Mixed quest" },
            ]}
          />
          <Choice<Company>
            label="Company"
            value={prefs.company}
            onChange={(v) => set("company", v)}
            options={[
              { value: "solo", text: "Solo" },
              { value: "together", text: "With someone" },
            ]}
          />
          <button
            className="btn earth"
            disabled={generating}
            onClick={() => {
              setStage("generating");
              void generate();
            }}
          >
            {generating ? "Growing your quest…" : "Grow my quest"}
          </button>
          <button className="btn secondary" onClick={() => setStage("landing")}>
            Back
          </button>
        </main>
      )}

      {stage === "generating" && (
        <main aria-live="polite">
          <div className="loading">
            <span className="spinner" aria-hidden="true" />
            <p>
              Asking the local model for a quest shaped around your {prefs.durationMinutes} minutes
              in the {prefs.environment}…
            </p>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button className="btn secondary" onClick={() => setStage("personalize")}>
                Adjust and retry
              </button>
            </div>
          )}
        </main>
      )}

      {stage === "card" && quest && (
        <main>
          <div className="meta">
            <span className="pill">{quest.durationMinutes} minutes</span>
            <span className={source === "model" ? "pill model" : "pill fallback"}>
              {source === "model" ? "Grown by local AI" : "Curated fallback"}
            </span>
          </div>
          <div className="card">
            <h2>{quest.title}</h2>
            <p className="lede">{quest.mission}</p>
            <ol className="steps">
              {quest.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="note">
              <span className="k">Done when</span>
              {quest.completionCondition}
            </div>
            <div className="note">
              <span className="k">If that is not there</span>
              {quest.fallback}
            </div>
            <div className="note safety">
              <span className="k">Stay safe</span>
              {quest.safetyNote}
            </div>
          </div>
          {saved?.response.note && <p className="small">{saved.response.note}</p>}
          <button className="btn earth" onClick={() => setStage("outside")}>
            I&rsquo;m heading outside
          </button>
          <button className="btn secondary" onClick={() => setStage("personalize")}>
            Grow a different quest
          </button>
        </main>
      )}

      {stage === "outside" && quest && (
        <main className="outside">
          <p className="big serif">
            Put the phone away.
            <br />
            The {quest.title} is waiting out there.
          </p>
          <p className="small">
            {quest.durationMinutes} minutes · {quest.steps.length} small observations · no timers,
            no checking in
          </p>
          <hr className="rule" />
          <button className="btn secondary" onClick={() => setStage("reflect")}>
            Back inside — reflect
          </button>
        </main>
      )}

      {stage === "reflect" && (
        <main>
          <h1 className="title">What did you notice that you would normally miss?</h1>
          <p className="small">Optional. A sentence or two is plenty. Saved only on this device.</p>
          <label className="field" htmlFor="reflection">
            <span className="label">Your reflection</span>
            <textarea
              id="reflection"
              className="reflect"
              value={reflection}
              onChange={(e) => {
                setReflection(e.target.value);
                setReflectionSaved(false);
              }}
              placeholder="The moss on the north wall was…"
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="btn" onClick={saveReflection} disabled={!reflection.trim()}>
            {reflectionSaved ? "Saved ✓" : "Save reflection"}
          </button>
          <button className="btn secondary" onClick={() => setStage("landing")}>
            Home
          </button>
        </main>
      )}
    </div>
  );
}
