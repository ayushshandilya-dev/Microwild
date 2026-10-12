import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERENCES,
  buildPrompt,
  parseSavedQuest,
  pickFallback,
  resolveQuest,
  validateQuest,
  type Quest,
  type QuestPreferences,
} from "../lib/quest.ts";

const PREFS: QuestPreferences = {
  durationMinutes: 10,
  energy: "gentle",
  environment: "courtyard",
  focus: "light",
  company: "solo",
};

function goodQuest(): Quest {
  return {
    title: "The Courtyard Sundial",
    mission: "Track how light moves across one enclosed courtyard.",
    durationMinutes: 10,
    steps: [
      "Find the brightest patch of courtyard ground and stand in it for ten breaths.",
      "Pick one drainpipe and memorize exactly where its courtyard shadow falls.",
      "Find three places where courtyard light arrives indirectly.",
    ],
    completionCondition: "You can point to the bright patch and three indirect lights.",
    fallback: "If the courtyard is evenly shaded, compare enclosed and open sounds instead.",
    safetyNote: "Stay in areas clearly meant for visitors and keep voices low.",
  };
}

describe("validateQuest", () => {
  it("accepts a valid quest", () => {
    const r = validateQuest(goodQuest(), PREFS);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
  });

  it("rejects non-objects and missing fields", () => {
    assert.equal(validateQuest(null, PREFS).ok, false);
    assert.equal(validateQuest({}, PREFS).ok, false);
    assert.equal(validateQuest("nope", PREFS).ok, false);
  });

  it("requires exactly three steps", () => {
    const q = { ...goodQuest(), steps: ["only one"] };
    const r = validateQuest(q, PREFS);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /steps/);
  });

  it("coerces object-form steps with identical meaning", () => {
    const q = {
      ...goodQuest(),
      steps: [
        { step: "Find the brightest patch of courtyard ground." },
        { text: "Pick one drainpipe and study its courtyard shadow." },
        { description: "Find three places where courtyard light arrives indirectly." },
      ],
    };
    const r = validateQuest(q, PREFS);
    assert.equal(r.ok, true, r.errors.join(";"));
    assert.deepEqual(q.steps, [
      "Find the brightest patch of courtyard ground.",
      "Pick one drainpipe and study its courtyard shadow.",
      "Find three places where courtyard light arrives indirectly.",
    ]);
  });

  it("rejects uninterpretable step objects", () => {
    const q = { ...goodQuest(), steps: [{ foo: 42 }, "Look at the courtyard sky", "Count courtyard benches"] };
    assert.equal(validateQuest(q, PREFS).ok, false);
  });

  it("requires the requested duration", () => {
    const q = { ...goodQuest(), durationMinutes: 5 };
    const r = validateQuest(q, PREFS);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /duration/);
  });

  it("rejects overlong fields", () => {
    const q = { ...goodQuest(), title: "x".repeat(500) };
    assert.equal(validateQuest(q, PREFS).ok, false);
  });

  it("rejects unsafe instructions", () => {
    for (const bad of [
      "Touch the moss to feel its texture",
      "Collect three leaves in your pocket",
      "Cross the road to the far planter",
      "Climb the low wall for a better view",
    ]) {
      const q = { ...goodQuest(), steps: [bad, "Look at the courtyard sky", "Count courtyard benches"] };
      const r = validateQuest(q, PREFS);
      assert.equal(r.ok, false, bad);
    }
  });

  it("requires a reference to the environment", () => {
    const q = {
      ...goodQuest(),
      mission: "Look at things.",
      steps: ["Look at things.", "Look at more things.", "Keep looking at things."],
    };
    const r = validateQuest(q, PREFS);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /courtyard/);
  });
});

describe("buildPrompt", () => {
  it("encodes duration, environment, and JSON shape", () => {
    const p = buildPrompt(PREFS);
    assert.match(p, /10 minutes/);
    assert.match(p, /courtyard/);
    assert.match(p, /"steps"/);
    assert.match(p, /durationMinutes/);
  });
});

describe("pickFallback", () => {
  it("facade Alphabet base step gives observable age clues, not guessing", () => {
    const q = pickFallback({
      ...DEFAULT_PREFERENCES,
      environment: "residential",
      focus: "patterns",
      energy: "gentle",
      company: "solo",
    });
    assert.equal(q.title, "Facade Alphabet");
    assert.match(q.steps[2], /visible clues/);
    assert.match(q.steps[2], /wear|paint|edges/);
    assert.doesNotMatch(q.steps[2], /by feel/);
    const r = validateQuest(
      { ...q, durationMinutes: 5 },
      { ...DEFAULT_PREFERENCES, environment: "residential", durationMinutes: 5 }
    );
    assert.equal(r.ok, true, r.errors.join(";"));
  });
  it("matches environment and focus, applies duration", () => {
    const q = pickFallback(PREFS);
    assert.equal(q.durationMinutes, 10);
    assert.match([q.mission, ...q.steps].join(" "), /courtyard/i);
    assert.equal(q.steps.length, 3);
  });
  it("falls back to environment match and validates clean", () => {
    for (const env of ["street", "residential", "courtyard", "park"] as const) {
      for (const mins of [5, 10, 15] as const) {
        const prefs = { ...DEFAULT_PREFERENCES, environment: env, durationMinutes: mins };
        const q = pickFallback(prefs);
        const r = validateQuest(
          { ...q, durationMinutes: prefs.durationMinutes },
          prefs
        );
        assert.equal(r.ok, true, `${env}/${mins}: ${r.errors.join(";")}`);
      }
    }
  });

  it("active energy changes the actual instructions", () => {
    const base = pickFallback({ ...PREFS, energy: "gentle", company: "solo" });
    const brisk = pickFallback({ ...PREFS, energy: "active", company: "solo" });
    assert.notDeepEqual(brisk.steps, base.steps);
    assert.match(brisk.steps.join(" "), /walk|pace|minute|block|circle/i);
    const r = validateQuest({ ...brisk, durationMinutes: 10 }, { ...PREFS, energy: "active" });
    assert.equal(r.ok, true, r.errors.join(";"));
  });

  it("together company changes the actual instructions", () => {
    const base = pickFallback({ ...PREFS, energy: "gentle", company: "solo" });
    const joint = pickFallback({ ...PREFS, energy: "gentle", company: "together" });
    assert.notDeepEqual(joint.steps, base.steps);
    assert.match(joint.steps.join(" "), /together|each other|swap|agree|partner/i);
    const r = validateQuest({ ...joint, durationMinutes: 10 }, { ...PREFS, company: "together" });
    assert.equal(r.ok, true, r.errors.join(";"));
  });

  it("prefers joint interaction when both energy and company differ", () => {
    const jointSolo = pickFallback({ ...PREFS, energy: "gentle", company: "together" });
    const jointActive = pickFallback({ ...PREFS, energy: "active", company: "together" });
    assert.deepEqual(jointActive.steps, jointSolo.steps);
  });

  it("all variants validate across every environment", () => {
    for (const env of ["street", "residential", "courtyard", "park"] as const) {
      for (const combo of [
        { energy: "gentle", company: "solo" },
        { energy: "active", company: "solo" },
        { energy: "gentle", company: "together" },
        { energy: "active", company: "together" },
      ] as const) {
        const prefs = { ...DEFAULT_PREFERENCES, environment: env, ...combo };
        const q = pickFallback(prefs);
        const r = validateQuest({ ...q, durationMinutes: prefs.durationMinutes }, prefs);
        assert.equal(r.ok, true, `${env}/${combo.energy}/${combo.company}: ${r.errors.join(";")}`);
      }
    }
  });
});

describe("resolveQuest", () => {
  it("returns model output when valid", async () => {
    const r = await resolveQuest(PREFS, async () => JSON.stringify(goodQuest()));
    assert.equal(r.source, "model");
    assert.equal(r.quest.title, "The Courtyard Sundial");
    assert.equal(r.note, undefined);
  });

  it("falls back labeled on malformed JSON", async () => {
    const r = await resolveQuest(PREFS, async () => "not json {{{");
    assert.equal(r.source, "fallback");
    assert.ok(r.note);
    assert.equal(r.quest.durationMinutes, 10);
  });

  it("falls back labeled on invalid model output", async () => {
    const r = await resolveQuest(PREFS, async () => JSON.stringify({ title: "x" }));
    assert.equal(r.source, "fallback");
    assert.ok(r.note);
  });

  it("falls back labeled on model timeout/unavailable", async () => {
    const r = await resolveQuest(PREFS, async () => {
      throw new Error("aborted");
    });
    assert.equal(r.source, "fallback");
    assert.ok(r.note);
  });

  it("falls back labeled on abort-signal timeout", async () => {
    const err = new Error("This operation was aborted");
    err.name = "AbortError";
    const logged: string[] = [];
    const orig = console.warn;
    console.warn = (msg: string) => void logged.push(String(msg));
    try {
      const r = await resolveQuest(PREFS, async () => {
        throw err;
      });
      assert.equal(r.source, "fallback");
      assert.ok(r.note);
      assert.match(logged.join(" "), /timeout/);
    } finally {
      console.warn = orig;
    }
  });

  it("fallback output always validates", async () => {
    const r = await resolveQuest(PREFS, async () => {
      throw new Error("down");
    });
    assert.equal(validateQuest(r.quest, PREFS).ok, true);
  });
});

describe("parseSavedQuest", () => {
  it("round-trips a saved quest", () => {
    const saved = {
      response: { quest: goodQuest(), source: "model" as const },
      prefs: PREFS,
      savedAt: "2026-10-11T00:00:00Z",
    };
    const back = parseSavedQuest(JSON.stringify(saved));
    assert.ok(back);
    assert.equal(back.response.quest.title, "The Courtyard Sundial");
  });

  it("rejects garbage, wrong shapes, and bad sources", () => {
    assert.equal(parseSavedQuest(null), null);
    assert.equal(parseSavedQuest("{{{"), null);
    assert.equal(parseSavedQuest(JSON.stringify({})), null);
    assert.equal(
      parseSavedQuest(
        JSON.stringify({ response: { quest: { steps: ["a"] }, source: "model" } })
      ),
      null
    );
    assert.equal(
      parseSavedQuest(
        JSON.stringify({
          response: { quest: { ...goodQuest(), source: undefined }, source: "ai-magic" },
        })
      ),
      null
    );
  });
});
