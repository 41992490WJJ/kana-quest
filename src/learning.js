import { ALL_KANA, KANA_BY_ID, ROWS } from "./data.js?v=2";

export const MASTERY_RULES = {
  minAttempts: 3,
  passingMastery: 80,
  recentWindow: 4,
  recentAccuracy: 0.75,
};

export function getRow(rowId) {
  return ROWS.find((row) => row.id === rowId);
}

export function getDisplayKana(kana) {
  return kana.script === "hira" ? kana.hira : kana.kata;
}

export function getRowStats(state, rowId) {
  const row = getRow(rowId);
  if (!row) return { attempts: 0, correct: 0, accuracy: 0, mastery: 0, status: "未学习", passed: false };
  const stats = row.kana.map((kana) => state.kanaStats[kana.id]);
  const attempts = stats.reduce((sum, item) => sum + item.attempts, 0);
  const correct = stats.reduce((sum, item) => sum + item.correct, 0);
  const mastery = stats.length
    ? Math.round(stats.reduce((sum, item) => sum + item.mastery, 0) / stats.length)
    : 0;
  const passed = row.kana.every((kana) => isKanaMastered(state.kanaStats[kana.id]));

  return {
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    mastery,
    status: passed || state.rows[rowId]?.passedAt ? "已通过" : attempts ? "学习中" : "未学习",
    passed,
  };
}

export function getOverallStats(state) {
  const stats = ALL_KANA.map((kana) => state.kanaStats[kana.id]);
  const attempts = stats.reduce((sum, item) => sum + item.attempts, 0);
  const correct = stats.reduce((sum, item) => sum + item.correct, 0);
  const mastery = Math.round(stats.reduce((sum, item) => sum + item.mastery, 0) / stats.length);
  const passedRows = ROWS.filter((row) => state.rows[row.id]?.passedAt).length;
  return {
    attempts,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    mastery,
    passedRows,
  };
}

export function isKanaMastered(stats) {
  const recent = stats.history.slice(-MASTERY_RULES.recentWindow);
  const recentAccuracy = recent.length ? recent.filter(Boolean).length / recent.length : 0;
  return (
    stats.attempts >= MASTERY_RULES.minAttempts &&
    stats.mastery >= MASTERY_RULES.passingMastery &&
    recent.length >= Math.min(MASTERY_RULES.recentWindow, stats.attempts) &&
    recentAccuracy >= MASTERY_RULES.recentAccuracy &&
    !stats.recentlyWrong
  );
}

export function isRowUnlocked(state, rowId) {
  const index = ROWS.findIndex((row) => row.id === rowId);
  return index === 0 || Boolean(state.rows[ROWS[index - 1]?.id]?.passedAt);
}

export function getNextLearningRow(state) {
  return ROWS.find((row) => isRowUnlocked(state, row.id) && !state.rows[row.id]?.passedAt) ?? ROWS[0];
}

export function areAllRowsPassed(state) {
  return ROWS.every((row) => Boolean(state.rows[row.id]?.passedAt));
}

export function getMistakeKana(state) {
  return ALL_KANA.filter((kana) => state.kanaStats[kana.id].wrong > 0);
}

export function scoreAnswer(state, kanaId, isCorrect) {
  const current = state.kanaStats[kanaId];
  const masteryDelta = isCorrect ? 18 + Math.min(current.streak, 3) * 2 : -22;
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
        mastery: clamp(current.mastery + masteryDelta, 0, 100),
        streak: isCorrect ? current.streak + 1 : 0,
        lastSeenAt: Date.now(),
        history: [...current.history, isCorrect].slice(-8),
      },
    },
  };
}

export function markRowPassed(state, rowId) {
  if (state.rows[rowId]?.passedAt) return state;
  return {
    ...state,
    rows: {
      ...state.rows,
      [rowId]: {
        ...state.rows[rowId],
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
      return stats.recentlyWrong || stats.mastery < MASTERY_RULES.passingMastery;
    })
    .map((kana) => kana.id);
  return [...base, ...weak];
}

export function chooseNextKanaId(queue, state) {
  if (!queue.length) return null;
  return chooseWeightedKana([...new Set(queue)].map((id) => KANA_BY_ID[id]), state).id;
}

export function getEligibleKana(state, rowId) {
  const currentIndex = ROWS.findIndex((row) => row.id === rowId);
  return ROWS.filter((row, index) => index === currentIndex || (index < currentIndex && state.rows[row.id]?.passedAt))
    .flatMap((row) => row.kana);
}

export function createRomajiOptions(kana, eligibleKana) {
  const eligibleIds = new Set(eligibleKana.map((item) => item.id));
  const confusableRomaji = kana.confusables
    .filter((id) => eligibleIds.has(id))
    .map((id) => KANA_BY_ID[id]?.romaji);
  const pool = unique([kana.romaji, ...confusableRomaji, ...eligibleKana.map((item) => item.romaji)]);
  return buildFourOptions(kana.romaji, pool);
}

export function buildQuizQuestion(state, rowId, mode = "row") {
  const target = chooseQuizTarget(state, rowId, mode);
  if (!target) return null;
  const targetRow = getRow(target.row);
  const eligibleKana = getQuizEligibleKana(state, rowId, mode);
  const type = sample(["kana-to-romaji", "romaji-to-kana", "dual-script"]);

  if (type === "romaji-to-kana") {
    return {
      type,
      targetId: target.id,
      scoreIds: [target.id],
      prompt: target.romaji,
      speechText: target.hira,
      answer: getDisplayKana(target),
      options: createKanaOptions(target, targetRow.kana, eligibleKana),
    };
  }

  if (type === "dual-script") {
    const hiraTarget = targetRow.kana.find((kana) => kana.romaji === target.romaji && kana.script === "hira");
    const kataTarget = targetRow.kana.find((kana) => kana.romaji === target.romaji && kana.script === "kata");
    return {
      type,
      targetId: target.id,
      scoreIds: [hiraTarget.id, kataTarget.id],
      prompt: target.romaji,
      speechText: hiraTarget.hira,
      hiraAnswer: hiraTarget.hira,
      kataAnswer: kataTarget.kata,
      hiraOptions: createKanaOptions(hiraTarget, targetRow.kana, eligibleKana),
      kataOptions: createKanaOptions(kataTarget, targetRow.kana, eligibleKana),
    };
  }

  return {
    type,
    targetId: target.id,
    scoreIds: [target.id],
    prompt: getDisplayKana(target),
    speechText: target.hira,
    answer: target.romaji,
    options: createRomajiOptions(target, eligibleKana),
  };
}

function chooseQuizTarget(state, rowId, mode) {
  if (mode === "mistakes") return chooseWeightedKana(getMistakeKana(state), state);
  if (mode === "comprehensive") return chooseWeightedKana(ALL_KANA, state);

  const currentRow = getRow(rowId);
  const currentIndex = ROWS.findIndex((row) => row.id === rowId);
  const historical = ROWS.filter((row, index) => index < currentIndex && state.rows[row.id]?.passedAt)
    .flatMap((row) => row.kana);
  const useHistory = historical.length > 0 && Math.random() < 0.25;
  return chooseWeightedKana(useHistory ? historical : currentRow.kana, state);
}

function getQuizEligibleKana(state, rowId, mode) {
  if (mode === "comprehensive") return ALL_KANA;
  if (mode === "mistakes") {
    const attempted = ALL_KANA.filter((kana) => state.kanaStats[kana.id].attempts > 0);
    return attempted.length >= 4 ? attempted : getEligibleKana(state, rowId);
  }
  return getEligibleKana(state, rowId);
}

function createKanaOptions(target, rowKana, eligibleKana) {
  const displayTarget = getDisplayKana(target);
  const eligibleIds = new Set(eligibleKana.map((item) => item.id));
  const confusables = target.confusables
    .filter((id) => eligibleIds.has(id))
    .map((id) => KANA_BY_ID[id])
    .filter((item) => item?.script === target.script)
    .map(getDisplayKana);
  const sameScript = eligibleKana
    .filter((item) => item.script === target.script)
    .map(getDisplayKana);
  const currentRow = rowKana
    .filter((item) => item.script === target.script)
    .map(getDisplayKana);
  return buildFourOptions(displayTarget, unique([displayTarget, ...confusables, ...currentRow, ...sameScript]));
}

function buildFourOptions(answer, pool) {
  const alternatives = shuffle(pool.filter((item) => item !== answer));
  return shuffle([answer, ...alternatives.slice(0, 3)]);
}

function chooseWeightedKana(kanaList, state) {
  if (!kanaList.length) return null;
  const now = Date.now();
  const weighted = kanaList.flatMap((kana) => {
    const stats = state.kanaStats[kana.id];
    const stale = !stats.lastSeenAt || now - stats.lastSeenAt > 7 * 24 * 60 * 60 * 1000;
    const confusableMistakes = kana.confusables.some((id) => state.kanaStats[id]?.recentlyWrong);
    const weight =
      1 +
      (stats.recentlyWrong ? 5 : 0) +
      (stats.mastery < 60 ? 2 : 0) +
      Math.max(0, 3 - stats.attempts) +
      (stale ? 1 : 0) +
      (confusableMistakes ? 2 : 0);
    return Array.from({ length: weight }, () => kana);
  });
  return sample(weighted);
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
