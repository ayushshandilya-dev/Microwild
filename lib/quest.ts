export type DurationMinutes = 5 | 10 | 15;
export type Energy = "gentle" | "moderate" | "active";
export type Environment = "street" | "residential" | "courtyard" | "park";
export type Focus = "life" | "light" | "patterns" | "mixed";
export type Company = "solo" | "together";

export interface QuestPreferences {
  durationMinutes: DurationMinutes;
  energy: Energy;
  environment: Environment;
  focus: Focus;
  company: Company;
}

export interface Quest {
  title: string;
  mission: string;
  durationMinutes: number;
  steps: string[];
  completionCondition: string;
  fallback: string;
  safetyNote: string;
}

export type QuestSource = "model" | "fallback";

export interface QuestResponse {
  quest: Quest;
  source: QuestSource;
  note?: string;
}

export const DEFAULT_PREFERENCES: QuestPreferences = {
  durationMinutes: 10,
  energy: "gentle",
  environment: "street",
  focus: "mixed",
  company: "solo",
};

const MAX = {
  title: 90,
  mission: 260,
  step: 220,
  completionCondition: 220,
  fallback: 220,
  safetyNote: 220,
};

const BANNED = [
  /\btouch(ing)?\b/i,
  /\bcollect(ing)?\b/i,
  /\bfeed(ing)?\b/i,
  /\bdisturb(ing)?\b/i,
  /\bcaptur(e|ing)\b/i,
  /\bpick(ing)? (flowers|leaves|plants|mushrooms|berries)\b/i,
  /\bclimb(ing)?\b/i,
  /\btrespass/i,
  /\bprivate propert/i,
  /\bcross(ing)? (the )?(road|street)/i,
  /\bisolated\b/i,
  /\bapproach .*animal/i,
  /\bchase\b/i,
  /\bstray\b/i,
];

const ENV_WORDS: Record<Environment, RegExp> = {
  street: /street|sidewalk|pavement|curb|kerb|lamppost|shopfront|bus stop/i,
  residential: /residential|building|doorway|wall|window|stairwell|balcon/i,
  courtyard: /courtyard/i,
  park: /park|tree|grass|bench|pond|flowerbed|lawn/i,
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function str(v: unknown, cap: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= cap;
}

function normalizeSteps(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      const text = ["step", "text", "description", "instruction"].find(
        (k) => typeof obj[k] === "string"
      );
      if (text) {
        out.push(obj[text] as string);
        continue;
      }
    }
    return null;
  }
  return out;
}

export function validateQuest(raw: unknown, prefs: QuestPreferences): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["not an object"] };
  const q = raw as Record<string, unknown>;
  if (!str(q.title, MAX.title)) errors.push("title missing/too long");
  if (!str(q.mission, MAX.mission)) errors.push("mission missing/too long");
  if (q.durationMinutes !== prefs.durationMinutes)
    errors.push(`duration must be ${prefs.durationMinutes}`);
  const steps = normalizeSteps(q.steps);
  if (!steps || !steps.every((s) => str(s, MAX.step)))
    return { ok: false, errors: [...errors, "steps must be exactly 3 non-empty strings"] };
  if (!str(q.completionCondition, MAX.completionCondition)) errors.push("completionCondition missing");
  if (!str(q.fallback, MAX.fallback)) errors.push("fallback missing");
  if (!str(q.safetyNote, MAX.safetyNote)) errors.push("safetyNote missing");
  if (errors.length > 0) return { ok: false, errors };

  const text = [q.mission, ...steps, q.completionCondition, q.fallback].join(" ");
  for (const re of BANNED) {
    if (re.test(text)) {
      errors.push(`unsafe instruction matching ${re.source}`);
      break;
    }
  }
  const envRe = ENV_WORDS[prefs.environment];
  const scoped = [q.mission, ...steps].join(" ");
  if (!envRe.test(scoped)) errors.push(`no reference to the ${prefs.environment} setting`);
  if (errors.length === 0) q.steps = steps;
  return { ok: errors.length === 0, errors };
}

export function buildPrompt(prefs: QuestPreferences): string {
  const company = prefs.company === "solo" ? "one person walking alone" : "two people walking together";
  return [
    "Create a short urban nature observation quest as compact JSON. No other text.",
    `Time available: ${prefs.durationMinutes} minutes. Energy: ${prefs.energy}.`,
    `Setting: ${prefs.environment} (an ordinary ${prefs.environment}; stay on public paths).`,
    `Observation focus: ${prefs.focus}. Company: ${company}.`,
    "Rules: exactly 3 concrete numbered observation steps, each doable in place within the time; one clear completion condition; one fallback if something is unavailable; one short safety reminder; never ask to touch, collect, feed, disturb, climb, enter private property, cross roads unsafely, approach animals, or go anywhere isolated.",
    'JSON shape exactly: {"title":string,"mission":string,"durationMinutes":number,"steps":[string,string,string],"completionCondition":string,"fallback":string,"safetyNote":string}.',
    'The steps array must contain three plain strings, for example: ["Stand still for ten breaths and list every sound.", "Find the oldest mark on the nearest wall.", "Compare the light on two opposite surfaces."].',
    `durationMinutes must equal ${prefs.durationMinutes}. At least one step must name the ${prefs.environment} setting.`,
  ].join("\n");
}

interface FallbackEntry {
  match: Partial<QuestPreferences>;
  quest: Omit<Quest, "durationMinutes">;
  brisk?: [string, string, string];
  together?: [string, string, string];
}

const FALLBACKS: FallbackEntry[] = [
  {
    match: { environment: "street", focus: "life" },
    quest: {
      title: "Cracks That Breathe",
      mission: "Find three ways living things persist in the concrete around you.",
      steps: [
        "Stand at the nearest curb and find one plant growing through a crack or drain edge; note exactly where it found soil.",
        "Look along the base of one wall or shopfront for moss, lichen, or a spiderweb; describe its texture in three words.",
        "Find one sign of an animal passing through — a feather, footprint, dropping, or nibbled leaf — and observe it from where you stand.",
      ],
      completionCondition: "You can name three concrete places where life is holding on.",
      fallback: "If the street is freshly cleaned, look up instead: compare leaves, nests, or webs on one tree, awning, and lamppost.",
      safetyNote: "Stay on the sidewalk and face oncoming foot traffic; never step into the road.",
    },
    brisk: [
      "Walk one full block and count every plant breaking through pavement; keep moving and call out each find.",
      "Every twenty paces, stop for one breath and check the nearest wall base for moss, lichen, or webs.",
      "Finish by naming the toughest street survivor you passed and exactly where it was growing.",
    ],
    together: [
      "One of you watches the ground for crack-plants while the other scans shopfront bases for moss and webs; swap roles after two minutes.",
      "Each pick the single toughest survivor you saw and argue why it wins.",
      "Agree together on three places within sight where life is holding on.",
    ],
  },
  {
    match: { environment: "street" },
    quest: {
      title: "Shadow Ledger",
      mission: "Compare the shadows and surfaces of three nearby street objects.",
      steps: [
        "Pick a lamppost, a parked bicycle or car, and one doorway; observe each shadow's edge for ten slow breaths.",
        "Rank the three shadows from sharpest to softest and guess what makes the difference.",
        "Find one surface where light changes its color — wet stone, glass, or a puddle — and note what it reflects.",
      ],
      completionCondition: "You have ranked three shadows and explained the ranking aloud or in your head.",
      fallback: "On a grey day with no shadows, compare three textures instead: rough stone, smooth glass, painted metal.",
      safetyNote: "Do not stare toward traffic or the sun; keep to the pedestrian side.",
    },
    brisk: [
      "Walk two blocks and note every sharp street shadow you pass without stopping; keep count.",
      "Stop once where three shadows overlap and rank them sharpest to softest in under a minute.",
      "Finish at the first reflective shopfront or puddle and note what it borrows from the sky.",
    ],
    together: [
      "Each choose one street shadow without telling the other, then describe only its edge until your partner finds it.",
      "Rank three shared shadows sharpest to softest and defend your order to each other.",
      "Find one surface together where light changes color and agree what it reflects.",
    ],
  },
  {
    match: { environment: "residential", focus: "patterns" },
    quest: {
      title: "Facade Alphabet",
      mission: "Read the patterns of one residential building like a text.",
      steps: [
        "Stand across from one building and count how many window shapes repeat; find the one window that breaks the pattern.",
        "Trace with your eyes one repeating line — brick courses, balcony rails, or drainpipes — from ground to roof.",
        "Find three small human marks — a worn step, a painted-over sign, initials in concrete — and order them oldest to newest using visible clues: deeper wear, paint layers underneath, sharper versus softened edges.",
      ],
      completionCondition: "You can describe the building's one broken pattern and three human marks.",
      fallback: "If the facade is blank glass, study the entrance instead: door handles, mats, buzzers, and posted notices.",
      safetyNote: "Observe from the public sidewalk; do not enter lobbies, stairwells, or courtyards.",
    },
    brisk: [
      "Walk past two residential buildings and note one repeating element on each without stopping.",
      "Stop at a third building for one minute and find its single broken pattern.",
      "Name three human marks across all three facades, oldest to newest by feel.",
    ],
    together: [
      "One of you counts repeating windows while the other traces one vertical building line from ground to roof; compare findings.",
      "Each find one human mark the other missed: a worn step, a painted sign, initials in concrete.",
      "Agree which mark is oldest and say why.",
    ],
  },
  {
    match: { environment: "residential" },
    quest: {
      title: "Doorstep Ecology",
      mission: "Notice three signs of life negotiating with one residential entrance.",
      steps: [
        "At the nearest doorway, find one plant — potted, wild, or wedged in paving — and note what it climbs toward.",
        "Look for one insect route: ants along a wall edge, a fly circling a light, or a spider anchored above the door.",
        "Listen for thirty seconds and separate one natural sound from the building sounds around it.",
      ],
      completionCondition: "You can point to one plant, one insect route, and one natural sound at a single doorway.",
      fallback: "If the entrance is bare, widen to the whole frontage: bins, walls, and window ledges all host life.",
      safetyNote: "Do not block the doorway or peer into windows; keep a respectful distance from residents.",
    },
    brisk: [
      "Pass three residential doorways in a row; at each, spot one plant in under thirty seconds.",
      "At the third doorway, spend one minute finding its insect route along wall or light.",
      "Name the liveliest doorway of the three and what makes it so.",
    ],
    together: [
      "Split senses for one minute at the same doorway: one of you only looks, the other only listens.",
      "Trade notes and combine them into one doorway portrait you both agree on.",
      "Together pick the single most surprising find and say why it surprised you.",
    ],
  },
  {
    match: { environment: "courtyard", focus: "light" },
    quest: {
      title: "The Courtyard Sundial",
      mission: "Track how light moves across one enclosed courtyard.",
      steps: [
        "Find the brightest patch of ground or wall and the darkest corner; stand halfway between them.",
        "Pick one fixed object — a drainpipe, bench, or planter — and memorize exactly where its shadow falls now.",
        "Find three places where light sneaks in indirectly: reflected off glass, under a door gap, through leaves.",
      ],
      completionCondition: "You can point to the bright patch, the dark corner, and three indirect light sources.",
      fallback: "If the courtyard is evenly shaded, compare enclosed versus open-sky sounds instead: one echo, one direct sound, one muffled sound.",
      safetyNote: "Courtyards echo; keep voices low and stay in areas clearly meant for residents or visitors.",
    },
    brisk: [
      "Circle the courtyard once at walking pace, noting bright ground, dark corners, and lit walls as you pass.",
      "Stop halfway for thirty seconds at the sharpest courtyard shadow edge you find.",
      "Name the brightest patch, darkest corner, and best indirect light from memory.",
    ],
    together: [
      "One of you tracks the brightest courtyard patch while the other tracks the darkest corner; meet halfway and compare.",
      "Each find one indirect courtyard light source the other missed.",
      "Agree where the sun will move the shadows next and why.",
    ],
  },
  {
    match: { environment: "courtyard" },
    quest: {
      title: "Still-Water Inventory",
      mission: "Catalog the small waters and shelters of one courtyard.",
      steps: [
        "Find every place water collects or passes: drains, puddles, saucers under pots, damp corners; count them.",
        "At the dampest spot, look for the smallest life — seedlings, moss, or insects — for one full minute.",
        "Find three shelters built for small creatures whether intended or not: an overhang, a gap in bricks, dense cover.",
      ],
      completionCondition: "You have counted the waters and named three shelters.",
      fallback: "If everything is bone dry, inventory shade instead: three grades of shadow from pale to deep.",
      safetyNote: "Do not drink or touch standing water; watch your step on damp stone.",
    },
    brisk: [
      "Walk the courtyard perimeter once, counting every damp spot, drain, and puddle without stopping.",
      "Return to the dampest one for a one-minute seedling and insect check.",
      "Name three courtyard shelters from memory as you leave.",
    ],
    together: [
      "One counts courtyard waters while the other counts shelters; compare totals at the center.",
      "Examine the dampest spot together for one full minute in silence.",
      "Each name one shelter and say who might live in it.",
    ],
  },
  {
    match: { environment: "park", focus: "life" },
    quest: {
      title: "Three Tenants of One Tree",
      mission: "Find three different living things sharing a single tree.",
      steps: [
        "Choose the nearest mature tree and circle it slowly once, scanning bark, branches, and roots.",
        "Find one plant growing on or against it, one insect or spider using it, and one sign of a bird or mammal.",
        "For each tenant, note what the tree provides it: food, shelter, vantage, or moisture.",
      ],
      completionCondition: "You can name three tenants of one tree and what each takes from it.",
      fallback: "If the first tree is quiet, try a fallen log, a dense bush, or the edge where mown grass meets planting.",
      safetyNote: "Stay on paths; do not climb, pull branches, or leave the maintained area.",
    },
    brisk: [
      "Visit two park trees: one minute each, at least one tenant per tree, keep moving.",
      "At the second tree, name what each tenant takes: food, shelter, vantage, or moisture.",
      "Pick the busier tree of the two and say what makes it so.",
    ],
    together: [
      "Each choose a different park tree; after two minutes, guide your partner to your best tenant without naming it.",
      "Reveal and compare: whose tree hosts more kinds of life?",
      "Together name what the busier tree provides that the other lacks.",
    ],
  },
  {
    match: { environment: "park" },
    quest: {
      title: "Edge Walk",
      mission: "Walk one boundary in the park and notice what changes at the edge.",
      steps: [
        "Walk one edge slowly — where lawn meets beds, path meets grass, or fence meets planting — for about five minutes.",
        "Stop three times and at each stop find one thing that lives exactly on the boundary line.",
        "Compare the ground on both sides of the line: color, dampness, and what grows there.",
      ],
      completionCondition: "You have three boundary finds and one comparison of the two sides.",
      fallback: "In a small park with no clear edges, use the path itself: compare its center, its edge, and two meters beyond it.",
      safetyNote: "Keep to marked paths and daylight areas; do not follow overgrown or fenced-off edges.",
    },
    brisk: [
      "Walk the longest park boundary at a steady pace for five minutes, noting every change underfoot.",
      "Stop twice only: once for a boundary-dweller, once to compare grass on both sides of the line.",
      "Finish by naming the sharpest change you passed.",
    ],
    together: [
      "Walk one park edge side by side; one watches the left of the line, the other the right.",
      "Stop three times and pool what each side offered.",
      "Agree on the single biggest difference between the two sides.",
    ],
  },
];

export function pickFallback(prefs: QuestPreferences): Quest {
  const byEnvFocus = FALLBACKS.find(
    (f) => f.match.environment === prefs.environment && f.match.focus === prefs.focus
  );
  const byEnv = FALLBACKS.find((f) => f.match.environment === prefs.environment);
  const entry = byEnvFocus ?? byEnv ?? FALLBACKS[0];
  // Base steps assume a gentle solo pace. When the user differs, prefer the
  // variant that changes the actual instructions: joint interaction wins over
  // pace when both differ, and is documented as such.
  let steps = entry.quest.steps;
  if (prefs.company === "together" && entry.together) steps = [...entry.together];
  else if (prefs.energy !== "gentle" && entry.brisk) steps = [...entry.brisk];
  return { ...entry.quest, steps, durationMinutes: prefs.durationMinutes };
}

export function parseSavedQuest(raw: string | null): SavedQuestData | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      response?: { quest?: Quest; source?: QuestSource };
      prefs?: QuestPreferences;
      savedAt?: string;
    };
    if (
      !parsed?.response?.quest?.steps ||
      parsed.response.quest.steps.length !== 3 ||
      (parsed.response.source !== "model" && parsed.response.source !== "fallback")
    )
      return null;
    return {
      response: parsed.response as QuestResponse,
      prefs: parsed.prefs as QuestPreferences,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export interface SavedQuestData {
  response: QuestResponse;
  prefs: QuestPreferences;
  savedAt: string;
}

export async function resolveQuest(
  prefs: QuestPreferences,
  generate: (prompt: string) => Promise<string>
): Promise<QuestResponse> {
  let failureReason = "unknown";
  try {
    const text = await generate(buildPrompt(prefs));
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      failureReason = "malformed-json";
      throw new Error(failureReason);
    }
    const check = validateQuest(parsed, prefs);
    if (!check.ok) {
      failureReason = `validation:${check.errors.join("; ")}`;
      throw new Error(failureReason);
    }
    return { quest: parsed as Quest, source: "model" };
  } catch (e) {
    if (failureReason === "unknown") {
      const aborted =
        (e instanceof Error && e.name === "AbortError") ||
        (e instanceof Error && /abort/i.test(e.message));
      failureReason = aborted ? "timeout" : `transport:${e instanceof Error ? e.message : "error"}`;
    }
    if (typeof console !== "undefined") console.warn(`[quest] model path failed (${failureReason}); serving labeled fallback.`);
    return {
      quest: pickFallback(prefs),
      source: "fallback",
      note: "The local model was unavailable or its output failed validation, so a curated quest was selected instead.",
    };
  }
}
