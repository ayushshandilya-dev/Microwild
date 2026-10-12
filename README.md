# MicroWild

**Find the wild in the places you already are.**

MicroWild creates short, personalized, screen-free urban nature observation
quests for people in dense built-up areas. You answer five quick questions,
get one quest card shaped around your time, energy, and surroundings — then
the app deliberately gets out of the way so you can go outside and look
closely at the world for a few minutes.

## The problem and who it is for

Dense-city dwellers often have no scenic park or trail nearby, and "go touch
grass" advice assumes access they don't have. MicroWild is for someone on an
ordinary street, in a residential block, a courtyard, or a small park, with
5–15 minutes to spare: it makes the nearby overlooked interesting, then ends
the screen session on purpose. No GPS, no camera, no account, no feed.

## What makes it distinct

- **Personalized to constraints that matter**: time, energy, setting, focus,
  company — each materially shapes the generated mission.
- **One card, then outside**: an explicit "I'm heading outside" transition to
  a minimal screen with no timers, progress checks, or notifications.
- **Honest completion**: the app never claims you went outside. An optional
  written reflection is the only record, stored locally.
- **Real open-weight AI with a labeled fallback**: quests are generated live
  by Gemma 3 1B through Ollama and strictly validated; if the model is down or
  its output fails validation, a curated quest is served **labeled as a
  fallback** — never misrepresented as model output.

## Screenshots to capture before submission

- [ ] Landing page (branding + tagline + "Create my quest")
- [ ] Personalize screen (five choice groups)
- [ ] Quest card showing the "Grown by local AI" pill
- [ ] Quest card showing the "Curated fallback" pill (stop Ollama or use airplane mode after load to force it... note: generation requires Ollama; disable it to capture this state)
- [ ] Outdoor mode screen
- [ ] Reflection screen
- [ ] One narrow-mobile-viewport (≤390px) capture of the quest card

## Architecture and data flow

```
Browser (Next.js 14, single page, 6 stages)
  │  POST /api/quest {preferences}      localStorage (quest + reflection)
  ▼                                      ▲
Next.js API route ──► Ollama :11434 ──► validate (strict schema + safety)
  │  success → {quest, source:"model"}      │  failure → curated {quest, source:"fallback"}
  └─────────────── JSON to UI ──────────────┘
```

Single process: `npm run dev` (or `npm start` after build) serves UI and API.
No database, no auth, no external APIs, no secrets. `OLLAMA_URL` and
`OLLAMA_MODEL` env vars override the local defaults.

## Open-weight AI: how it is used

- Model: **gemma3:1b (Q4_K_M, 815MB)** served by local Ollama. One short
  call per quest (`format: "json"`, temperature 0.7, max ~350 tokens).
- The prompt encodes preferences, the exact JSON shape (with a steps example),
  duration equality, an environment reference, and safety rules.
- `resolveQuest()` parses, validates, and either returns the model quest or a
  labeled curated fallback. Validation rejects: wrong shape/step count,
  wrong duration, overlong fields, banned instructions (touch/collect/feed/
  disturb/climb/road-crossing/animals/isolation…), and missing setting
  reference. A tolerant coercion accepts `[{step: "..."}]`-style step objects
  with identical meaning — added after observing real Gemma output; all safety
  checks still apply to the coerced text.

## Why local-first and replaceable models matter

Repository-free personal use, offline-after-generation behavior, zero cost,
and no data leaving the machine all follow from local inference. The Ollama
endpoint and model name are the only integration points (two env vars), so a
stronger open-weight model can replace Gemma 3 1B without touching UI,
validation, or fallback logic.

## Measured results (Intel MacBook Air 2015, i5-5350U)

- Tiny JSON probe: **~11s**, valid.
- Full quest generation: **~26–33s** model time when the machine is quiet;
  up to **~92s** observed under load (valid quest arriving just past the old
  90s cutoff — the server timeout is now 150s). Two verified `source:"model"`
  quests: courtyard/light/10-min and park/life/5-min, both materially shaped
  by their preferences.
- Failure classes are now logged server-side as
  timeout / malformed-json / validation / transport, so repeated fallbacks
  can be diagnosed instead of guessed at.
- Observed model quirks: first attempt emitted `steps` as `[{step}]` objects
  (handled by coercion); whimsical titles ("Courtroom Light Study") pass
  through unedited.
- Validation suite caught two real defects during development (an
  over-aggressive banned-word regex and a curated fallback tripping its own
  safety rule) — both fixed and covered by tests.

## Schema validation and fallback

`validateQuest()` enforces shape, lengths, duration equality, exactly three
steps, banned unsafe content, and an environment reference. Anything failing
validation — or any model timeout/error — yields a curated fallback with
`source:"fallback"` plus an explanatory note shown in the UI. All 12
environment×duration fallback combinations are test-asserted valid.

## What has and has not been tested

- Tested: full journey via API + UI serving (landing → preferences → live
  model quest → card → outdoor screen → reflection save), invalid-input 400s,
  malformed/timeout model-output fallback, abort-classification unit test,
  save/reopen parsing, `tsc`, production build.
- NOT tested outdoors with a real user walk; no genuine field test yet.
- NOT tested: narrow-viewport visual QA beyond responsive CSS (capture the
  screenshot manually), end-to-end abort with Ollama stopped mid-generation
  (classification logic is unit-tested; the live path is not).

## Known limitations and next steps

- Generation takes ~30s on this hardware; a loading state covers it, but a
  progress hint would help.
- Model output quality varies (odd titles, occasional generic steps); the
  validator guarantees structure and safety, not brilliance.
- Reflections and quests live only in `localStorage` (per browser/device).
- Next highest-value work: (1) a real outdoor walk-through with notes,
  (2) prompt tuning from failed-validation samples, (3) screenshot capture
  per the checklist above.

## Setup and run

Requirements: Node 22+, Ollama running locally with `gemma3:1b`
(`ollama pull gemma3:1b` once, ~815MB).

```bash
cd microwild
npm install
npm test        # 25 unit tests (validator, fallback + variants, resolve, persistence parsing)
npm run dev -- -p 3100   # UI at http://localhost:3100
npm run build   # production build check
```

Optional: `OLLAMA_URL` / `OLLAMA_MODEL` env vars to point elsewhere.

## Submission

Challenge: DEV Open-Source AI Challenge, Week 1 ("Touch Grass").
Tags for the DEV post: `#devchallenge` `#hf26challenge`.
