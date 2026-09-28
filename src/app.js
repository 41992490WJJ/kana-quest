import { KANA_BY_ID, ROWS } from "./data.js";
import {
  buildLearnQueue,
  buildQuizQuestion,
  chooseNextKanaId,
  createRomajiOptions,
  getDisplayKana,
  getRow,
  getRowStats,
  isKanaMastered,
  markRowPassed,
  scoreAnswer,
} from "./learning.js";
import { exportState, importState, loadState, resetState, saveState } from "./storage.js";

let state = loadState();
let learnQueue = [];
let currentLearnKanaId = null;
let quizQuestion = null;
let quizCount = 0;
let dualSelections = { hira: null, kata: null };

const els = {
  views: {
    home: document.querySelector("#homeView"),
    learn: document.querySelector("#learnView"),
    quiz: document.querySelector("#quizView"),
    records: document.querySelector("#recordsView"),
  },
  courseGrid: document.querySelector("#courseGrid"),
  homeMastery: document.querySelector("#homeMastery"),
  homeMasteryBar: document.querySelector("#homeMasteryBar"),
  homeAttempts: document.querySelector("#homeAttempts"),
  homeAccuracy: document.querySelector("#homeAccuracy"),
  homeStatus: document.querySelector("#homeStatus"),
  learnStrip: document.querySelector("#learnStrip"),
  learnStepLabel: document.querySelector("#learnStepLabel"),
  learnMasteryLabel: document.querySelector("#learnMasteryLabel"),
  learnPrompt: document.querySelector("#learnPrompt"),
  learnOptions: document.querySelector("#learnOptions"),
  learnFeedback: document.querySelector("#learnFeedback"),
  quizTypeLabel: document.querySelector("#quizTypeLabel"),
  quizProgressLabel: document.querySelector("#quizProgressLabel"),
  quizPrompt: document.querySelector("#quizPrompt"),
  quizInstruction: document.querySelector("#quizInstruction"),
  quizOptions: document.querySelector("#quizOptions"),
  dualChoice: document.querySelector("#dualChoice"),
  dualHiraOptions: document.querySelector("#dualHiraOptions"),
  dualKataOptions: document.querySelector("#dualKataOptions"),
  quizFeedback: document.querySelector("#quizFeedback"),
  recordsBody: document.querySelector("#recordsBody"),
  toast: document.querySelector("#toast"),
};

document.querySelector("#startALineBtn").addEventListener("click", () => startLearning("a"));
document.querySelector("#startQuizBtn").addEventListener("click", () => startQuiz("a"));
document.querySelector("#exportBtn").addEventListener("click", downloadExport);
document.querySelector("#importInput").addEventListener("change", handleImport);
document.querySelector("#resetBtn").addEventListener("click", handleReset);
document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewTarget));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

renderAll();

function showView(viewName) {
  Object.entries(els.views).forEach(([name, view]) => {
    view.classList.toggle("active", name === viewName);
  });
  if (viewName === "records") renderRecords();
}

function renderAll() {
  renderHome();
  renderCourses();
  renderRecords();
}

function renderHome() {
  const rowStats = getRowStats(state, "a");
  els.homeMastery.textContent = `${rowStats.mastery}%`;
  els.homeMasteryBar.style.width = `${rowStats.mastery}%`;
  els.homeAttempts.textContent = String(rowStats.attempts);
  els.homeAccuracy.textContent = `${rowStats.accuracy}%`;
  els.homeStatus.textContent = rowStats.status;
}

function renderCourses() {
  els.courseGrid.innerHTML = "";
  ROWS.forEach((row) => {
    const stats = row.kana.length ? getRowStats(state, row.id) : null;
    const button = document.createElement("button");
    button.className = "course-card";
    button.disabled = !row.unlocked;
    button.innerHTML = `
      <span class="course-row-title">
        <strong>${row.name}</strong>
        <span class="status-pill">${stats?.status ?? "待扩展"}</span>
      </span>
      <span class="kana-preview">${row.kana.length ? row.kana.map(getDisplayKana).join(" ") : "后续加入"}</span>
      <span class="metric-label">${stats ? `掌握度 ${stats.mastery}% · 正确率 ${stats.accuracy}%` : "结构已预留"}</span>
    `;
    if (row.unlocked) button.addEventListener("click", () => startLearning(row.id));
    els.courseGrid.append(button);
  });
}

function startLearning(rowId) {
  state = saveState({
    ...state,
    activeRow: rowId,
    rows: {
      ...state.rows,
      [rowId]: {
        ...(state.rows[rowId] ?? {}),
        status: "in-progress",
      },
    },
  });
  learnQueue = buildLearnQueue(state, rowId);
  currentLearnKanaId = null;
  showView("learn");
  nextLearnQuestion();
}

function nextLearnQuestion() {
  const row = getRow(state.activeRow);
  const rowStats = getRowStats(state, row.id);
  if (rowStats.passed) {
    state = saveState(markRowPassed(state, row.id));
    showToast(`${row.name}学习完成`);
    startQuiz(row.id);
    return;
  }

  if (!learnQueue.length) learnQueue = buildLearnQueue(state, row.id);
  currentLearnKanaId = chooseNextKanaId(learnQueue, state);
  renderLearnQuestion();
}

function renderLearnQuestion() {
  const row = getRow(state.activeRow);
  const kana = KANA_BY_ID[currentLearnKanaId];
  const stats = state.kanaStats[currentLearnKanaId];
  els.learnStepLabel.textContent = `${kana.script === "hira" ? "平假名" : "片假名"} · 已练 ${stats.attempts} 次`;
  els.learnMasteryLabel.textContent = `熟练度 ${stats.mastery}%`;
  els.learnPrompt.textContent = getDisplayKana(kana);
  els.learnFeedback.textContent = "";
  els.learnFeedback.className = "feedback";
  renderKanaStrip(row);
  renderOptions(els.learnOptions, createRomajiOptions(kana, row.kana), kana.romaji, (answer, button) => {
    handleLearnAnswer(answer === kana.romaji, button, kana.romaji);
  });
}

function renderKanaStrip(row) {
  els.learnStrip.innerHTML = "";
  row.kana.forEach((kana) => {
    const stats = state.kanaStats[kana.id];
    const item = document.createElement("div");
    item.className = "strip-item";
    item.classList.toggle("active", kana.id === currentLearnKanaId);
    item.classList.toggle("mastered", isKanaMastered(stats));
    item.textContent = `${getDisplayKana(kana)} ${kana.romaji}`;
    els.learnStrip.append(item);
  });
}

function handleLearnAnswer(isCorrect, button, correctAnswer) {
  lockButtons(els.learnOptions);
  button.classList.add(isCorrect ? "correct" : "wrong");
  state = saveState(scoreAnswer(state, currentLearnKanaId, isCorrect));
  if (isCorrect) {
    els.learnFeedback.textContent = "正确";
    els.learnFeedback.className = "feedback ok";
    learnQueue = learnQueue.filter((id, index) => id !== currentLearnKanaId || index !== learnQueue.indexOf(id));
  } else {
    els.learnFeedback.textContent = `正确读音是 ${correctAnswer}，稍后会再出现。`;
    els.learnFeedback.className = "feedback bad";
    learnQueue.push(currentLearnKanaId, currentLearnKanaId);
  }
  renderAll();
  window.setTimeout(nextLearnQuestion, isCorrect ? 650 : 1200);
}

function startQuiz(rowId) {
  state = saveState({ ...state, activeRow: rowId });
  quizCount = 0;
  showView("quiz");
  nextQuizQuestion();
}

function nextQuizQuestion() {
  quizQuestion = buildQuizQuestion(state, state.activeRow);
  quizCount += 1;
  dualSelections = { hira: null, kata: null };
  renderQuizQuestion();
}

function renderQuizQuestion() {
  els.quizFeedback.textContent = "";
  els.quizFeedback.className = "feedback";
  els.quizOptions.classList.toggle("hidden", quizQuestion.type === "dual-script");
  els.dualChoice.classList.toggle("hidden", quizQuestion.type !== "dual-script");
  els.quizProgressLabel.textContent = `第 ${quizCount} 题`;

  if (quizQuestion.type === "dual-script") {
    els.quizTypeLabel.textContent = "同一读音";
    els.quizPrompt.textContent = quizQuestion.prompt;
    els.quizInstruction.textContent = "分别选出平假名和片假名";
    renderOptions(els.dualHiraOptions, quizQuestion.hiraOptions, quizQuestion.hiraAnswer, (answer, button) => {
      dualSelections.hira = answer;
      setSelected(els.dualHiraOptions, button);
      checkDualAnswer();
    });
    renderOptions(els.dualKataOptions, quizQuestion.kataOptions, quizQuestion.kataAnswer, (answer, button) => {
      dualSelections.kata = answer;
      setSelected(els.dualKataOptions, button);
      checkDualAnswer();
    });
    return;
  }

  els.quizTypeLabel.textContent = quizQuestion.type === "kana-to-romaji" ? "假名 → 读音" : "读音 → 假名";
  els.quizPrompt.textContent = quizQuestion.prompt;
  els.quizInstruction.textContent = "选择正确答案";
  renderOptions(els.quizOptions, quizQuestion.options, quizQuestion.answer, (answer, button) => {
    handleQuizAnswer(answer === quizQuestion.answer, button, quizQuestion.answer);
  });
}

function handleQuizAnswer(isCorrect, button, correctAnswer) {
  lockButtons(els.quizOptions);
  button.classList.add(isCorrect ? "correct" : "wrong");
  state = saveState(scoreAnswer(state, quizQuestion.targetId, isCorrect));
  els.quizFeedback.textContent = isCorrect ? "正确" : `正确答案是 ${correctAnswer}`;
  els.quizFeedback.className = `feedback ${isCorrect ? "ok" : "bad"}`;
  finishQuizStep();
}

function checkDualAnswer() {
  if (!dualSelections.hira || !dualSelections.kata) return;
  const isCorrect =
    dualSelections.hira === quizQuestion.hiraAnswer &&
    dualSelections.kata === quizQuestion.kataAnswer;
  lockButtons(els.dualHiraOptions);
  lockButtons(els.dualKataOptions);
  markDualButtons();
  state = saveState(scoreAnswer(state, quizQuestion.targetId, isCorrect));
  els.quizFeedback.textContent = isCorrect
    ? "正确"
    : `正确答案是 ${quizQuestion.hiraAnswer} 和 ${quizQuestion.kataAnswer}`;
  els.quizFeedback.className = `feedback ${isCorrect ? "ok" : "bad"}`;
  finishQuizStep();
}

function finishQuizStep() {
  const rowStats = getRowStats(state, state.activeRow);
  if (rowStats.passed) {
    state = saveState(markRowPassed(state, state.activeRow));
    renderAll();
    window.setTimeout(() => {
      showToast("あ行学习完成");
      showView("home");
    }, 900);
    return;
  }
  renderAll();
  window.setTimeout(nextQuizQuestion, 950);
}

function renderOptions(container, options, answer, onClick) {
  container.innerHTML = "";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-btn";
    button.type = "button";
    button.textContent = option;
    button.dataset.answer = answer;
    button.addEventListener("click", () => onClick(option, button));
    container.append(button);
  });
}

function setSelected(container, selectedButton) {
  [...container.querySelectorAll(".option-btn")].forEach((button) => {
    button.classList.toggle("correct", button === selectedButton);
  });
}

function markDualButtons() {
  [
    [els.dualHiraOptions, quizQuestion.hiraAnswer],
    [els.dualKataOptions, quizQuestion.kataAnswer],
  ].forEach(([container, answer]) => {
    [...container.querySelectorAll(".option-btn")].forEach((button) => {
      button.classList.toggle("correct", button.textContent === answer);
      button.classList.toggle("wrong", button.classList.contains("correct") === false);
    });
  });
}

function lockButtons(container) {
  container.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
}

function renderRecords() {
  const row = getRow("a");
  els.recordsBody.innerHTML = "";
  row.kana.forEach((kana) => {
    const stats = state.kanaStats[kana.id];
    const rowEl = document.createElement("tr");
    rowEl.innerHTML = `
      <td>${getDisplayKana(kana)}</td>
      <td>${kana.romaji}</td>
      <td>${stats.attempts}</td>
      <td>${stats.correct}</td>
      <td>${stats.wrong}</td>
      <td>${stats.mastery}%</td>
      <td>${stats.recentlyWrong ? "答错" : stats.attempts ? "答对" : "未练习"}</td>
    `;
    els.recordsBody.append(rowEl);
  });
}

function downloadExport() {
  const blob = new Blob([exportState(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kana-quest-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("已导出学习记录");
}

async function handleImport(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    state = importState(await file.text());
    renderAll();
    showToast("已导入学习记录");
  } catch {
    showToast("导入失败，请检查 JSON 文件");
  } finally {
    event.target.value = "";
  }
}

function handleReset() {
  if (!window.confirm("确定要重置本机学习记录吗？")) return;
  state = resetState();
  renderAll();
  showToast("已重置学习记录");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}
