import { ROWS } from "./data.js";

const STORAGE_KEY = "kanaQuest:v1";

function freshKanaStats() {
  return Object.fromEntries(
    ROWS.flatMap((row) => row.kana).map((kana) => [
      kana.id,
      {
        kanaId: kana.id,
        attempts: 0,
        correct: 0,
        wrong: 0,
        recentlyWrong: false,
        mastery: 0,
        streak: 0,
        lastSeenAt: 0,
        history: [],
      },
    ]),
  );
}

export function createDefaultState() {
  return {
    version: 1,
    activeRow: "a",
    rows: {
      a: {
        status: "not-started",
        passedAt: null,
      },
    },
    kanaStats: freshKanaStats(),
    sessions: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return mergeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

export function saveState(state) {
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
}

export function resetState() {
  const state = createDefaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function exportState(state) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "kana-quest",
      state,
    },
    null,
    2,
  );
}

export function importState(jsonText) {
  const parsed = JSON.parse(jsonText);
  const incomingState = parsed.state ?? parsed;
  return saveState(mergeState(incomingState));
}

function mergeState(input) {
  const defaults = createDefaultState();
  const rows = {
    ...defaults.rows,
    ...(input.rows ?? {}),
  };
  const kanaStats = {
    ...defaults.kanaStats,
    ...(input.kanaStats ?? {}),
  };

  return {
    ...defaults,
    ...input,
    rows,
    kanaStats,
    sessions: Array.isArray(input.sessions) ? input.sessions : [],
  };
}
