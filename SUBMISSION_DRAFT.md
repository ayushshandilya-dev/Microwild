# MicroWild: Find the Wild in the Places You Already Are

*DEV Open-Source AI Challenge, Week 1 — "Touch Grass"*
*Tags: `#devchallenge` `#hf26challenge`*

The city block you walk every day has moss having an argument with concrete,
spiders running logistics under the awning, and a whole politics of shadow
you have never once looked at. MicroWild is a small app that turns the next
ten minutes of your ordinary street into a guided observation quest — then
gets off your screen so you can actually go look.

## The problem

"Go touch grass" assumes grass. For people in dense built-up areas, nature
advice usually means destination recommendations: drive to a park, find a
trail, download another app with accounts, maps, and streaks. None of that
helps someone with ten minutes on a residential street. And generic nature
chatbots answer questions without ever changing what you notice when you look
up. MicroWild inverts this: the AI's whole job is to make your *offline* ten
minutes more interesting, then end the session on purpose.

## What it does

Five quick choices (time, energy, setting, focus, company) → one quest card
with three concrete steps, a completion condition, a fallback, and a safety
note → an explicit "I'm heading outside" screen with no timers or progress
tracking → optional written reflection saved on your device. No GPS, no
camera, no account, no database, no feed.

## Architecture

One Next.js process serves the UI and a single `POST /api/quest` route. The
route validates preferences against a whitelist, makes exactly one short
Ollama call (`gemma3:1b`, JSON mode, ~350 output tokens, 150s abort budget),
and hands the text to `resolveQuest()`: parse → strict schema validation →
return as model-generated, or fall back. A curated 8-quest fallback library
(with pace and company variants) covers model outages and validation
failures, always labeled `source:"fallback"` with an explanatory note shown
in the UI. Quests and reflections persist in `localStorage` only.

## Why local Gemma, and why fallbacks

Local open-weight inference means zero cost, no data leaving the machine, and
no accounts — the right shape for a personal nature app. On a 2015 MacBook
Air, Gemma 3 1B generates a valid quest in ~26–33s when quiet, up to ~92s
under load; the server classifies every failure (timeout, malformed JSON,
validation, transport) in its logs. Because small models are nondeterministic
in output shape, the validator coerces equivalent step representations but
never relaxes safety rules — and anything failing validation becomes a labeled
fallback, never a fake AI result.

## Validation, privacy, safety

Every model output must pass shape, length, duration-equality, step-count,
banned-instruction (touch/collect/feed/disturb/climb/road-crossing/animals/
isolation), and setting-reference checks — 25 unit tests cover validator,
fallback matrix, resolve paths, and persistence parsing. Nothing personal is
collected; nothing leaves the device except the prompt to localhost Ollama.
Safety is enforced twice: prompt rules plus validator rejection.

## Verified results

`npm test`: 25/25 pass. `tsc --noEmit`: clean. `next build`: succeeds. Live:
landing 200, two verified `source:"model"` quests shaped by their
preferences, invalid input rejected (400), fallback served labeled on model
failure. One real outdoor walk completed (curated Facade Alphabet quest:
understandable, mildly more interesting, wording friction found and fixed).
Honestly unverified: a second walk validating the revised wording, narrow-
viewport visual QA, and browser persistence round-trips.

## Limitations

Generation is slow on old hardware; model quality varies (odd titles pass
through unedited); quests and reflections live only in one browser; no
offline model bundling. The curated library is honest but shallower than
generation. Facade Alphabet wording was improved after one real outdoor test;
a second validating walk has not happened.

## Try it

Requires Node 22+ and local Ollama with `gemma3:1b`. `npm install`, `npm
test`, `npm run dev -- -p 3100`. Repository: https://github.com/ayushshandilya-dev/Microwild. Screenshots: *[capture per README checklist before
submitting]*.

The point was never a smarter chatbot. It was ten minutes outside, looking
closely at something you had walked past a hundred times. Go outside; the
app insists.
