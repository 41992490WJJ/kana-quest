import { ALL_KANA, ROWS } from "./data.js?v=2";

export const STORAGE_KEY = "kanaQuest:v1";
export const SCHEMA_VERSION = 2;

let storageStatus = { writable: true, message: "" };

function createKanaStats(kanaId) {
  return {
    kanaId,
    attempts: 0,
    correct: 0,
    wrong: 0,
    recentlyWrong: false,
    mastery: 0,
    streak: 0,
    lastSeenAt: 0,
    history: [],
  };
}

function freshKanaStats() {
  return Object.fromEntries(ALL_KANA.map((kana) => [kana.id, createKanaStats(kana.id)]));
}

function freshRows() {
  return Object.fromEntries(
    ROWS.map((row) => [row.id, { status: "not-started", passedAt: null }]),
  );
}

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeRow: "a",
    rows: freshRows(),
    kanaStats: freshKanaStats(),
    sessions: [],
    settings: {
      autoPlayCorrect: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function getStorageStatus() {
  return { ...storageStatus };
}

export function loadState() {
  storageStatus = { writable: true, message: "" };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultState();

  try {
    const parsed = JSON.parse(raw);
    const previousVersion = getSchemaVersion(parsed);
    const state = mergeState(migrateState(parsed));
    if (previousVersion !== SCHEMA_VERSION) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    return state;
  } catch (error) {
    storageStatus = {
      writable: false,
      message: `旧学习记录无法迁移，原始存档已保留。请先导出或导入有效备份。${formatError(error)}`,
    };
    return createDefaultState();
  }
}

export function saveState(state) {
  const nextState = {
    ...mergeState(state),
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  if (!storageStatus.writable) return nextState;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    storageStatus = {
      writable: false,
      message: `学习记录暂时无法保存，现有存档没有被删除。${formatError(error)}`,
    };
  }
  return nextState;
}

export function resetState() {
  const state = createDefaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  storageStatus = { writable: true, message: "" };
  return state;
}

export function exportState(state) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "kana-quest",
      storageKey: STORAGE_KEY,
      schemaVersion: SCHEMA_VERSION,
      state: mergeState(state),
    },
    null,
    2,
  );
}

export function importState(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!isPlainRecord(parsed)) throw new Error("JSON 顶层必须是对象");
  if (parsed.app && parsed.app !== "kana-quest") throw new Error("不是本程序的学习记录");
  const incomingState = parsed.state ?? parsed;
  const imported = mergeState(migrateState(incomingState));

  localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
  storageStatus = { writable: true, message: "" };
  return imported;
}

function migrateState(input) {
  if (!isPlainRecord(input)) throw new Error("存档内容不是对象");
  let state = JSON.parse(JSON.stringify(input));
  let version = getSchemaVersion(state);

  if (!Number.isInteger(version) || version < 1) throw new Error("存档版本无效");
  if (version > SCHEMA_VERSION) throw new Error("存档来自更高版本的程序");

  if (version === 1) {
    state = {
      ...state,
      schemaVersion: 2,
      settings: {
        autoPlayCorrect: true,
        ...(isPlainRecord(state.settings) ? state.settings : {}),
      },
    };
    delete state.version;
    version = 2;
  }

  return state;
}

function getSchemaVersion(state) {
  return Number(state?.schemaVersion ?? state?.version ?? 1);
}

function mergeState(input) {
  if (!isPlainRecord(input)) throw new Error("存档内容不是对象");
  if (input.rows !== undefined && !isPlainRecord(input.rows)) throw new Error("课程记录格式无效");
  if (input.kanaStats !== undefined && !isPlainRecord(input.kanaStats)) throw new Error("假名记录格式无效");
  if (input.sessions !== undefined && !Array.isArray(input.sessions)) throw new Error("学习场次格式无效");
  if (input.settings !== undefined && !isPlainRecord(input.settings)) throw new Error("设置格式无效");

  const defaults = createDefaultState();
  const rows = Object.fromEntries(
    ROWS.map((row) => [row.id, sanitizeRowState(input.rows?.[row.id], defaults.rows[row.id])]),
  );
  const kanaStats = Object.fromEntries(
    ALL_KANA.map((kana) => [
      kana.id,
      sanitizeKanaStats(input.kanaStats?.[kana.id], defaults.kanaStats[kana.id]),
    ]),
  );
  const activeRow = ROWS.some((row) => row.id === input.activeRow) ? input.activeRow : "a";

  return {
    schemaVersion: SCHEMA_VERSION,
    activeRow,
    rows,
    kanaStats,
    sessions: Array.isArray(input.sessions) ? input.sessions.slice(-100) : [],
    settings: {
      autoPlayCorrect: input.settings?.autoPlayCorrect !== false,
    },
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : defaults.updatedAt,
  };
}

function sanitizeRowState(value, fallback) {
  if (!isPlainRecord(value)) return fallback;
  return {
    status: ["not-started", "in-progress", "passed"].includes(value.status)
      ? value.status
      : fallback.status,
    passedAt: typeof value.passedAt === "string" ? value.passedAt : null,
  };
}

function sanitizeKanaStats(value, fallback) {
  if (!isPlainRecord(value)) return fallback;
  const attempts = safeNonNegativeInteger(value.attempts);
  const correct = Math.min(attempts, safeNonNegativeInteger(value.correct));
  const wrong = Math.min(attempts, safeNonNegativeInteger(value.wrong));
  return {
    kanaId: fallback.kanaId,
    attempts,
    correct,
    wrong,
    recentlyWrong: Boolean(value.recentlyWrong),
    mastery: clamp(safeFiniteNumber(value.mastery), 0, 100),
    streak: safeNonNegativeInteger(value.streak),
    lastSeenAt: safeNonNegativeInteger(value.lastSeenAt),
    history: Array.isArray(value.history) ? value.history.slice(-8).map(Boolean) : [],
  };
}

function safeNonNegativeInteger(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function safeFiniteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatError(error) {
  return error instanceof Error && error.message ? `（${error.message}）` : "";
}
