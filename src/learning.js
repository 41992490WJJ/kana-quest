import { ALL_ROMAJI, KANA_BY_ID, ROWS } from "./data.js";

const MIN_ATTEMPTS_PER_KANA = 3;
const PASSING_MASTERY = 80;
const RECENT_WINDOW = 4;

export function getRow(rowId) {
  return ROWS.find((row) => row.id === rowId);
}

export function getDisplayKana(kana) {
  return kana.script === "hira" ? kana.hira : kana.kata;
}

export function getRowStats(state, rowId) {
  const row = getRow(rowId);
  const stats = row.kana.map((kana) => state.kanaStats[kana.id]);
  const attempts = stats.reduce((sum, item) => sum + item.attempts, 0);
  const correct = stats.reduce((sum, item) => sum + item.correct, 0);
  const mastery = stats.length
    ? Math.round(stats.reduce((sum, item) => sum + item.mastery, 0) / stats.length)
    : 0;
  const passed = row.kana.length > 0 && row.kana.every((kana) => isKanaMastered(state.kanaStats[kana.id]));

  return {
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    mastery,
    status: passed ? "已通过" : attempts ? "学习中" : "未学习",
    passed,
  };
}

export function isKanaMastered(stats) {
  const recent = stats.history.slice(-RECENT_WINDOW);
  const recentAccuracy = recent.length
    ? recent.filter(Boolean).length / recent.length
    : 0;
  return (
    stats.attempts >= MIN_ATTEMPTS_PER_KANA &&
    stats.mastery >= PASSING_MASTERY &&
    recent.length >= Math.min(RECENT_WINDOW, stats.attempts) &&
    recentAccuracy >= 0.75 &&
    !stats.recentlyWrong
  );
}

export function scoreAnswer(state, kanaId, isCorrect) {
  const current = state.kanaStats[kanaId];
  const masteryDelta = isCorrect ? 18 + Math.min(current.streak, 3) * 2 : -22;
  const nextMastery = clamp(current.mastery + masteryDelta, 0, 100);
  const nextHistory = [...current.history, isCorrect].slice(-8);

  return {
    ...state,
    kanaStats: {
      ...state.kanaStats,
      [kanaId]: {
        ...current,
        attempts: current.attempts + 1,
        correct: current.correct + (isCorrect ? 1 : 0),
        wrong: current.wrong + (isCorrect ? 0 : 1),
        recentlyWrong: !isCorrect,
        mastery: nextMastery,
        streak: isCorrect ? current.streak + 1 : 0,
        lastSeenAt: Date.now(),
        history: nextHistory,
      },
    },
  };
}

export function markRowPassed(state, rowId) {
  const rowState = state.rows[rowId] ?? {};
  return {
    ...state,
    rows: {
      ...state.rows,
      [rowId]: {
        ...rowState,
        status: "passed",
        passedAt: new Date().toISOString(),
      },
    },
  };
}

export function buildLearnQueue(state, rowId) {
  const row = getRow(rowId);
  const base = row.kana.flatMap((kana) => [kana.id, kana.id]);
  const weak = row.kana
    .filter((kana) => {
      const stats = state.kanaStats[kana.id];
      return stats.recentlyWrong || stats.mastery < PASSING_MASTERY;
    })
    .map((kana) => kana.id);

  return [...base, ...weak];
}

export function chooseNextKanaId(queue, state) {
  if (!queue.length) return null;
  const weighted = queue.flatMap((id) => {
    const stats = state.kanaStats[id];
    const weight =
      1 +
      (stats.recentlyWrong ? 3 : 0) +
      (stats.mastery < 45 ? 2 : 0) +
      (stats.attempts < MIN_ATTEMPTS_PER_KANA ? 2 : 0);
    return Array.from({ length: weight }, () => id);
  });
  return sample(weighted);
}

export function createRomajiOptions(kana, learnedKana = []) {
  const confusableRomaji = kana.confusables
    .map((id) => KANA_BY_ID[id])
    .filter(Boolean)
    .map((item) => item.romaji);
  const learnedRomaji = learnedKana.map((item) => item.romaji);
  const pool = unique([kana.romaji, ...confusableRomaji, ...learnedRomaji, ...ALL_ROMAJI]);
  return shuffle([kana.romaji, ...shuffle(pool.filter((item) => item !== kana.romaji)).slice(0, 3)]);
}

export function buildQuizQuestion(state, rowId) {
  const row = getRow(rowId);
  const learnedKana = ROWS.filter((candidate) => candidate.id === rowId || state.rows[candidate.id]?.passedAt)
    .flatMap((candidate) => candidate.kana);
  const target = chooseWeightedKana(row.kana, state);
  const type = sample(["kana-to-romaji", "romaji-to-kana", "dual-script"]);

  if (type === "romaji-to-kana") {
    const sameScript = row.kana.filter((kana) => kana.script === target.script);
    return {
      type,
      targetId: target.id,
      prompt: target.romaji,
      answer: getDisplayKana(target),
      options: createKanaOptions(target, sameScript, learnedKana),
    };
  }

  if (type === "dual-script") {
    const hiraTarget = row.kana.find((kana) => kana.romaji === target.romaji && kana.script === "hira");
    const kataTarget = row.kana.find((kana) => kana.romaji === target.romaji && kana.script === "kata");
    return {
      type,
      targetId: target.id,
      prompt: target.romaji,
      hiraAnswer: hiraTarget.hira,
      kataAnswer: kataTarget.kata,
      hiraOptions: createKanaOptions(hiraTarget, row.kana.filter((kana) => kana.script === "hira"), learnedKana),
      kataOptions: createKanaOptions(kataTarget, row.kana.filter((kana) => kana.script === "kata"), learnedKana),
    };
  }

  return {
    type,
    targetId: target.id,
    prompt: getDisplayKana(target),
    answer: target.romaji,
    options: createRomajiOptions(target, learnedKana),
  };
}

function createKanaOptions(target, sameScriptKana, learnedKana) {
  const displayTarget = getDisplayKana(target);
  const confusables = target.confusables
    .map((id) => KANA_BY_ID[id])
    .filter((item) => item && item.script === target.script)
    .map(getDisplayKana);
  const learnedSameScript = learnedKana
    .filter((item) => item.script === target.script)
    .map(getDisplayKana);
  const currentRowSameScript = sameScriptKana.map(getDisplayKana);
  const pool = unique([displayTarget, ...confusables, ...currentRowSameScript, ...learnedSameScript]);
  return shuffle([displayTarget, ...shuffle(pool.filter((item) => item !== displayTarget)).slice(0, 3)]);
}

function chooseWeightedKana(kanaList, state) {
  const weighted = kanaList.flatMap((kana) => {
    const stats = state.kanaStats[kana.id];
    const weight =
      1 +
      (stats.recentlyWrong ? 5 : 0) +
      (stats.mastery < 60 ? 2 : 0) +
      Math.max(0, 3 - stats.attempts);
    return Array.from({ length: weight }, () => kana);
  });
  return sample(weighted);
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
