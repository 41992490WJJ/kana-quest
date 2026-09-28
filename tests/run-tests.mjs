import assert from "node:assert/strict";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();

const data = await import("../src/data.js");
const storage = await import("../src/storage.js");
const learning = await import("../src/learning.js");

assert.equal(data.ROWS.length, 11, "应有 11 个基础课程");
assert.equal(data.ALL_KANA.length, 92, "应有 46 个音对应的平假名和片假名");
assert.deepEqual(data.ROWS.map((row) => row.id), ["a", "ka", "sa", "ta", "na", "ha", "ma", "ya", "ra", "wa", "n"]);

const oldState = {
  version: 1,
  activeRow: "a",
  rows: { a: { status: "in-progress", passedAt: null } },
  kanaStats: {
    "a-hira": {
      kanaId: "a-hira",
      attempts: 7,
      correct: 5,
      wrong: 2,
      recentlyWrong: false,
      mastery: 72,
      streak: 2,
      lastSeenAt: 12345,
      history: [true, false, true, true],
    },
  },
  sessions: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};
localStorage.setItem(storage.STORAGE_KEY, JSON.stringify(oldState));
const migrated = storage.loadState();
assert.equal(migrated.schemaVersion, 2);
assert.equal(migrated.kanaStats["a-hira"].attempts, 7, "旧课程次数必须保留");
assert.equal(migrated.kanaStats["a-hira"].wrong, 2, "旧课程错题必须保留");
assert.equal(migrated.kanaStats["ka-hira"].attempts, 0, "新课程应补默认记录");
assert.equal(JSON.parse(localStorage.getItem(storage.STORAGE_KEY)).schemaVersion, 2, "迁移结果应写回固定 key");

const refreshed = storage.loadState();
assert.equal(refreshed.kanaStats["a-hira"].attempts, 7, "刷新后记录应保持");
const beforeBadImport = localStorage.getItem(storage.STORAGE_KEY);
assert.throws(() => storage.importState('{"app":"another-app","state":{}}'));
assert.equal(localStorage.getItem(storage.STORAGE_KEY), beforeBadImport, "非法导入不能覆盖存档");

localStorage.setItem(storage.STORAGE_KEY, "{broken-json");
const brokenRaw = localStorage.getItem(storage.STORAGE_KEY);
storage.loadState();
assert.equal(storage.getStorageStatus().writable, false, "迁移失败后应锁定自动写入");
storage.saveState(storage.createDefaultState());
assert.equal(localStorage.getItem(storage.STORAGE_KEY), brokenRaw, "迁移失败后必须保留原始存档");
storage.importState(JSON.stringify({ app: "kana-quest", state: migrated }));

let unlockState = storage.createDefaultState();
assert.equal(learning.isRowUnlocked(unlockState, "a"), true);
assert.equal(learning.isRowUnlocked(unlockState, "ka"), false);
unlockState.rows.a.passedAt = new Date().toISOString();
assert.equal(learning.isRowUnlocked(unlockState, "ka"), true, "通过前一行后应解锁下一行");
assert.equal(learning.isRowUnlocked(unlockState, "sa"), false, "不能跨行解锁");

const sequentialState = storage.createDefaultState();
for (let index = 0; index < data.ROWS.length; index += 1) {
  const row = data.ROWS[index];
  assert.equal(learning.isRowUnlocked(sequentialState, row.id), true, `${row.name}应按顺序解锁`);
  sequentialState.rows[row.id].passedAt = new Date().toISOString();
  if (index + 2 < data.ROWS.length) {
    assert.equal(learning.isRowUnlocked(sequentialState, data.ROWS[index + 2].id), false, "不能跳过下一行解锁");
  }
}
assert.equal(learning.areAllRowsPassed(sequentialState), true);

const shi = data.KANA_BY_ID["shi-kata"];
const saOnly = data.ROWS.find((row) => row.id === "sa").kana;
const gatedOptions = learning.createRomajiOptions(shi, saOnly);
assert.equal(gatedOptions.includes("tsu"), false, "未学习的易混淆假名不能进入选项");

let mixedState = storage.createDefaultState();
mixedState.rows.a.passedAt = new Date().toISOString();
let historyQuestions = 0;
const samples = 1200;
for (let index = 0; index < samples; index += 1) {
  const question = learning.buildQuizQuestion(mixedState, "ka", "row");
  if (data.KANA_BY_ID[question.targetId].row === "a") historyQuestions += 1;
}
const historyRatio = historyQuestions / samples;
assert.ok(historyRatio > 0.18 && historyRatio < 0.32, `历史题比例应接近 25%，实际为 ${historyRatio}`);

let spokenUtterance = null;
class MockUtterance extends EventTarget {
  constructor(text) {
    super();
    this.text = text;
  }
}
globalThis.window = {
  SpeechSynthesisUtterance: MockUtterance,
  setTimeout,
  speechSynthesis: {
    getVoices: () => [{ lang: "ja-JP", name: "Mock Japanese", default: true, localService: true }],
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    speak: (utterance) => {
      spokenUtterance = utterance;
      queueMicrotask(() => utterance.dispatchEvent(new Event("end")));
    },
  },
};
globalThis.SpeechSynthesisUtterance = MockUtterance;
const speech = await import("../src/speech.js");
await speech.speakJapanese("あ");
assert.equal(spokenUtterance.text, "あ");
assert.equal(spokenUtterance.lang, "ja-JP");

console.log(JSON.stringify({
  rows: data.ROWS.length,
  kanaEntries: data.ALL_KANA.length,
  migratedAttempts: migrated.kanaStats["a-hira"].attempts,
  historyRatio: Number(historyRatio.toFixed(3)),
  speechLanguage: spokenUtterance.lang,
}));
