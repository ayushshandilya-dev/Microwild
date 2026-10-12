import { NextResponse } from "next/server";
import {
  resolveQuest,
  type QuestPreferences,
} from "@/lib/quest";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:1b";
// Valid model output has been observed arriving just past 90s on loaded
// hardware, so the cutoff tolerates a slow tail; true failures still fall
// back immediately via the error paths below.
const TIMEOUT_MS = 150_000;

const DURATIONS = [5, 10, 15];
const ENERGIES = ["gentle", "moderate", "active"];
const ENVIRONMENTS = ["street", "residential", "courtyard", "park"];
const FOCI = ["life", "light", "patterns", "mixed"];
const COMPANIES = ["solo", "together"];

function validPreferences(raw: unknown): raw is QuestPreferences {
  if (typeof raw !== "object" || raw === null) return false;
  const p = raw as Record<string, unknown>;
  return (
    DURATIONS.includes(p.durationMinutes as number) &&
    ENERGIES.includes(p.energy as string) &&
    ENVIRONMENTS.includes(p.environment as string) &&
    FOCI.includes(p.focus as string) &&
    COMPANIES.includes(p.company as string)
  );
}

export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const prefs = (body as { preferences?: unknown })?.preferences;
  if (!validPreferences(prefs)) {
    return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await resolveQuest(prefs, async (prompt) => {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          format: "json",
          options: { temperature: 0.7, top_p: 0.9, num_predict: 350 },
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { response?: unknown };
      if (typeof data.response !== "string") throw new Error("No text response");
      return data.response;
    });
    return NextResponse.json(result);
  } finally {
    clearTimeout(timer);
  }
}
