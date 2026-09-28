import { ALL_KANA, KANA_BY_ID, ROWS } from "./data.js?v=2";
import {
  areAllRowsPassed,
  buildLearnQueue,
  buildQuizQuestion,
  chooseNextKanaId,
  createRomajiOptions,
  getDisplayKana,
  getEligibleKana,
  getMistakeKana,
  getNextLearningRow,
  getOverallStats,
  getRow,
  getRowStats,
  isKanaMastered,
  isRowUnlocked,
  markRowPassed,
  scoreAnswer,
} from "./learning.js?v=2";
import { getSpeechSupport, speakJapanese, stopSpeech } from "./speech.js?v=2";
import {
  exportState,
  getStorageStatus,
  importState,
  loadState,
  resetState,
  saveState,
} from "./storage.js?v=2";

let state = loadState();
let learnQueue = [];
let currentLearnKanaId = null;
let learnReviewMode = false;
let learnAnsweredCount = 0;
let quizQuestion = null;
let quizCount = 0;
let quizMode = "row";
let quizReviewMode = false;
let dualSelections = { hira: null, kata: null };
let transitionTimer = null;

const els = {
  views: {
    home: document.querySelector("#homeView"),
    learn: document.querySelector("#learnView"),
    quiz: document.querySelector("#quizView"),
    records: document.querySelector("#recordsView"),
  },
  storageWarning: document.querySelector("#storageWarning"),
  courseGrid: document.querySelector("#courseGrid"),
  homeMastery: document.querySelector("#homeMastery"),
  homeMasteryBar: document.querySelector("#homeMasteryBar"),
  homeAttempts: document.querySelector("#homeAttempts"),
  homeAccuracy: document.querySelector("#homeAccuracy"),
  homeStatus: document.querySelector("#homeStatus"),
  startNextRowBtn: document.querySelector("#startNextRowBtn"),
  mistakeQuizBtn: document.querySelector("#mistakeQuizBtn"),
  comprehensiveQuizBtn: document.querySelector("#comprehensiveQuizBtn"),
  autoPlayToggle: document.querySelector("#autoPlayToggle"),
  speechStatus: document.querySelector("#speechStatus"),
  testSpeechBtn: document.querySelector("#testSpeechBtn"),
  learnTitle: document.querySelector("#learnTitle"),
  learnStrip: document.querySelector("#learnStrip"),
  toggleLearnStrip: document.querySelector("#toggleLearnStrip"),
  learnStepLabel: document.querySelector("#learnStepLabel"),
  learnMasteryLabel: document.querySelector("#learnMasteryLabel"),
  learnPrompt: document.querySelector("#learnPrompt"),
  learnOptions: document.querySelector("#learnOptions"),
  learnFeedback: document.querySelector("#learnFeedback"),
  learnSpeakBtn: document.querySelector("#learnSpeakBtn"),
  quizTitle: document.querySelector("#quizTitle"),
  quizTypeLabel: document.querySelector("#quizTypeLabel"),
  quizProgressLabel: document.querySelector("#quizProgressLabel"),
  quizPrompt: document.querySelector("#quizPrompt"),
  quizInstruction: document.querySelector("#quizInstruction"),
  quizOptions: document.querySelector("#quizOptions"),
  dualChoice: document.querySelector("#dualChoice"),
  dualHiraOptions: document.querySelector("#dualHiraOptions"),
  dualKataOptions: document.querySelector("#dualKataOptions"),
  quizFeedback: document.querySelector("#quizFeedback"),
  quizSpeakBtn: document.querySelector("#quizSpeakBtn"),
  recordsRowFilter: document.querySelector("#recordsRowFilter"),
  recordsBody: document.querySelector("#recordsBody"),
  toast: document.querySelector("#toast"),
};

els.startNextRowBtn.addEventListener("click", () => startLearning(getNextLearningRow(state).id));
els.mistakeQuizBtn.addEventListener("click", () => startQuiz(state.activeRow, "mistakes"));
els.comprehensiveQuizBtn.addEventListener("click", () => startQuiz(state.activeRow, "comprehensive"));
els.toggleLearnStrip.addEventListener("click", toggleLearnStrip);
els.learnSpeakBtn.addEventListener("click", () => playSpeech(KANA_BY_ID[currentLearnKanaId]?.hira));
els.quizSpeakBtn.addEventListener("click", () => playSpeech(quizQuestion?.speechText));
els.testSpeechBtn.addEventListener("click", () => playSpeech("あいうえお", true));
els.autoPlayToggle.addEventListener("change", () => {
  state = saveState({
    ...state,
    settings: { ...state.settings, autoPlayCorrect: els.autoPlayToggle.checked },
  });
  renderStorageWarning();
});
els.recordsRowFilter.addEventListener("change", renderRecords);
document.querySelector("#exportBtn").addEventListener("click", downloadExport);
document.querySelector("#importInput").addEventListener("change", handleImport);
document.querySelector("#resetBtn").addEventListener("click", handleReset);
document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewTarget));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=2").catch(() => {}));
}

setupRecordFilter();
renderAll();
detectSpeech();

function showView(viewName) {
  window.clearTimeout(transitionTimer);
  stopSpeech();
  Object.entries(els.views).forEach(([name, view]) => view.classList.toggle("active", name === viewName));
  if (viewName === "records") renderRecords();
}

function renderAll() {
  renderStorageWarning();
  renderHome();
  renderCourses();
  renderRecords();
  els.autoPlayToggle.checked = state.settings.autoPlayCorrect;
}

function renderStorageWarning() {
  const status = getStorageStatus();
  els.storageWarning.textContent = status.message;
  els.storageWarning.classList.toggle("hidden", !status.message);
}

function renderHome() {
  const overall = getOverallStats(state);
  const nextRow = getNextLearningRow(state);
  els.homeMastery.textContent = `${overall.mastery}%`;
  els.homeMasteryBar.style.width = `${overall.mastery}%`;
  els.homeAttempts.textContent = String(overall.attempts);
  els.homeAccuracy.textContent = `${overall.accuracy}%`;
  els.homeStatus.textContent = `${overall.passedRows} / ${ROWS.length} 行`;
  els.startNextRowBtn.textContent = state.rows[nextRow.id]?.passedAt
    ? `重新学习 ${nextRow.name}`
    : `开始 / 继续 ${nextRow.name}`;
  els.mistakeQuizBtn.disabled = getMistakeKana(state).length === 0;
  els.comprehensiveQuizBtn.disabled = !areAllRowsPassed(state);
}

function renderCourses() {
  els.courseGrid.innerHTML = "";
  ROWS.forEach((row) => {
    const stats = getRowStats(state, row.id);
    const unlocked = isRowUnlocked(state, row.id);
    const card = document.createElement("article");
    card.className = "course-card";
    card.classList.toggle("locked", !unlocked);
    card.innerHTML = `
      <span class="course-row-title">
        <strong>${row.name}</strong>
        <span class="status-pill">${unlocked ? stats.status : "未解锁"}</span>
      </span>
      <span class="kana-preview">${row.kana.filter((kana) => kana.script === "hira").map(getDisplayKana).join(" ")}</span>
      <span class="kana-preview kata-preview">${row.kana.filter((kana) => kana.script === "kata").map(getDisplayKana).join(" ")}</span>
      <span class="metric-label">掌握度 ${stats.mastery}% · 正确率 ${stats.accuracy}%</span>
      <span class="course-actions"></span>
    `;
    const actions = card.querySelector(".course-actions");
    if (unlocked) {
      actions.append(
        createCommandButton(state.rows[row.id]?.passedAt ? "重新学习" : "学习", "primary-btn", () => startLearning(row.id)),
        createCommandButton("行测试", "secondary-btn", () => startQuiz(row.id, "row")),
      );
    } else {
      const previous = ROWS[row.order - 1];
      const hint = document.createElement("span");
      hint.className = "unlock-hint";
      hint.textContent = `通过${previous.name}后解锁`;
      actions.append(hint);
    }
    els.courseGrid.append(card);
  });
}

function createCommandButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function startLearning(rowId) {
  if (!isRowUnlocked(state, rowId)) return;
  learnReviewMode = Boolean(state.rows[rowId]?.passedAt);
  learnAnsweredCount = 0;
  state = saveState({
    ...state,
    activeRow: rowId,
    rows: {
      ...state.rows,
      [rowId]: {
        ...state.rows[rowId],
        status: learnReviewMode ? "passed" : "in-progress",
      },
    },
  });
  learnQueue = buildLearnQueue(state, rowId);
  currentLearnKanaId = null;
  setLearnStripExpanded(false);
  els.learnTitle.textContent = `${getRow(rowId).name}学习`;
  showView("learn");
  nextLearnQuestion();
}

function nextLearnQuestion() {
  const row = getRow(state.activeRow);
  const rowStats = getRowStats(state, row.id);
  if (!learnReviewMode && learnAnsweredCount > 0 && rowStats.passed) {
    state = saveState(markRowPassed(state, row.id));
    renderAll();
    showToast(`${row.name}学习完成，已解锁下一行`);
    startQuiz(row.id, "row");
    return;
  }
  if (learnReviewMode && learnAnsweredCount > 0 && learnQueue.length === 0) {
    showToast(`${row.name}复习完成`);
    startQuiz(row.id, "row");
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
  renderOptions(
    els.learnOptions,
    createRomajiOptions(kana, getEligibleKana(state, row.id)),
    kana.romaji,
    (answer, button) => handleLearnAnswer(answer === kana.romaji, button, kana.romaji),
  );
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

function toggleLearnStrip() {
  setLearnStripExpanded(els.learnStrip.classList.contains("hidden"));
}

function setLearnStripExpanded(expanded) {
  els.learnStrip.classList.toggle("hidden", !expanded);
  els.toggleLearnStrip.setAttribute("aria-expanded", String(expanded));
  els.toggleLearnStrip.textContent = expanded ? "⌃ 收起本行假名表" : "⌄ 查看本行假名表";
}

function handleLearnAnswer(isCorrect, button, correctAnswer) {
  lockButtons(els.learnOptions);
  button.classList.add(isCorrect ? "correct" : "wrong");
  state = saveState(scoreAnswer(state, currentLearnKanaId, isCorrect));
  learnAnsweredCount += 1;
  const kana = KANA_BY_ID[currentLearnKanaId];
  if (isCorrect) {
    els.learnFeedback.textContent = "正确";
    els.learnFeedback.className = "feedback ok";
    const index = learnQueue.indexOf(currentLearnKanaId);
    if (index >= 0) learnQueue.splice(index, 1);
    if (state.settings.autoPlayCorrect) playSpeech(kana.hira);
  } else {
    els.learnFeedback.textContent = `正确读音是 ${correctAnswer}，稍后会再出现。`;
    els.learnFeedback.className = "feedback bad";
    learnQueue.push(currentLearnKanaId, currentLearnKanaId);
  }
  renderAll();
  schedule(nextLearnQuestion, isCorrect ? 800 : 1300);
}

function startQuiz(rowId, mode) {
  if (mode === "mistakes" && getMistakeKana(state).length === 0) {
    showToast("目前还没有错题记录");
    return;
  }
  if (mode === "comprehensive" && !areAllRowsPassed(state)) {
    showToast("通过全部基础课程后解锁综合测试");
    return;
  }
  if (mode === "row" && !isRowUnlocked(state, rowId)) return;

  state = saveState({ ...state, activeRow: rowId });
  quizMode = mode;
  quizReviewMode = mode === "row" && Boolean(state.rows[rowId]?.passedAt);
  quizCount = 0;
  els.quizTitle.textContent = mode === "mistakes"
    ? "错题测试"
    : mode === "comprehensive"
      ? "综合测试"
      : `${getRow(rowId).name}测试`;
  showView("quiz");
  nextQuizQuestion();
}

function nextQuizQuestion() {
  quizQuestion = buildQuizQuestion(state, state.activeRow, quizMode);
  if (!quizQuestion) {
    showToast("当前没有可测试的内容");
    showView("home");
    return;
  }
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
  scoreQuizQuestion(isCorrect);
  els.quizFeedback.textContent = isCorrect ? "正确" : `正确答案是 ${correctAnswer}`;
  els.quizFeedback.className = `feedback ${isCorrect ? "ok" : "bad"}`;
  if (isCorrect && state.settings.autoPlayCorrect) playSpeech(quizQuestion.speechText);
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
  scoreQuizQuestion(isCorrect);
  els.quizFeedback.textContent = isCorrect
    ? "正确"
    : `正确答案是 ${quizQuestion.hiraAnswer} 和 ${quizQuestion.kataAnswer}`;
  els.quizFeedback.className = `feedback ${isCorrect ? "ok" : "bad"}`;
  if (isCorrect && state.settings.autoPlayCorrect) playSpeech(quizQuestion.speechText);
  finishQuizStep();
}

function scoreQuizQuestion(isCorrect) {
  state = quizQuestion.scoreIds.reduce(
    (nextState, kanaId) => scoreAnswer(nextState, kanaId, isCorrect),
    state,
  );
  state = saveState(state);
}

function finishQuizStep() {
  renderAll();
  if (quizMode === "row" && !quizReviewMode && getRowStats(state, state.activeRow).passed) {
    const row = getRow(state.activeRow);
    state = saveState(markRowPassed(state, row.id));
    renderAll();
    schedule(() => {
      showToast(`${row.name}学习完成`);
      showView("home");
    }, 1000);
    return;
  }
  const reviewGoal = quizMode === "row" ? 10 : 15;
  if ((quizReviewMode || quizMode !== "row") && quizCount >= reviewGoal) {
    schedule(() => {
      showToast("本轮测试完成");
      showView("home");
    }, 1000);
    return;
  }
  schedule(nextQuizQuestion, 1050);
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
    button.classList.toggle("selected", button === selectedButton);
  });
}

function markDualButtons() {
  [
    [els.dualHiraOptions, quizQuestion.hiraAnswer, dualSelections.hira],
    [els.dualKataOptions, quizQuestion.kataAnswer, dualSelections.kata],
  ].forEach(([container, answer, selected]) => {
    [...container.querySelectorAll(".option-btn")].forEach((button) => {
      button.classList.toggle("correct", button.textContent === answer);
      button.classList.toggle("wrong", button.textContent === selected && selected !== answer);
    });
  });
}

function lockButtons(container) {
  container.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
}

function setupRecordFilter() {
  els.recordsRowFilter.innerHTML = '<option value="all">全部课程</option>';
  ROWS.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = row.name;
    els.recordsRowFilter.append(option);
  });
}

function renderRecords() {
  const selected = els.recordsRowFilter.value || "all";
  const kanaList = selected === "all" ? ALL_KANA : getRow(selected).kana;
  els.recordsBody.innerHTML = "";
  kanaList.forEach((kana) => {
    const stats = state.kanaStats[kana.id];
    const rowEl = document.createElement("tr");
    rowEl.innerHTML = `
      <td>${getDisplayKana(kana)}</td>
      <td>${getRow(kana.row).name}</td>
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

async function detectSpeech() {
  const support = await getSpeechSupport();
  els.speechStatus.textContent = support.message;
  els.testSpeechBtn.disabled = !support.supported;
  els.learnSpeakBtn.disabled = !support.supported;
  els.quizSpeakBtn.disabled = !support.supported;
}

async function playSpeech(text, isTest = false) {
  if (!text) return;
  try {
    await speakJapanese(text);
    if (isTest) showToast("日语发音测试完成");
  } catch (error) {
    const message = error instanceof Error ? error.message : "发音失败，请稍后重试。";
    els.speechStatus.textContent = message;
    showToast(message);
  }
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
    showToast("已导入并校验学习记录");
  } catch (error) {
    showToast(error instanceof Error ? `导入失败：${error.message}` : "导入失败，请检查 JSON 文件");
  } finally {
    event.target.value = "";
  }
}

function handleReset() {
  if (!window.confirm("确定要重置本机学习记录吗？此操作不会影响已导出的备份。")) return;
  state = resetState();
  renderAll();
  showToast("已重置学习记录");
}

function schedule(callback, delay) {
  window.clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(callback, delay);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2400);
}
