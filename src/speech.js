const JAPANESE_LANGUAGE = "ja-JP";
const CANCEL_SETTLE_MS = 200;
const SHORT_KANA_WARMUP_MS = 180;

let cachedJapaneseVoices = null;
let voicesLoadingPromise = null;
let activeUtterance = null;
let playbackRequestId = 0;
let lastCancelAt = 0;
let lastSpokenText = null;
let lastSpeechStartAt = 0;

export async function getSpeechSupport(timeoutMs = 1200) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return {
      supported: false,
      voices: [],
      message: "此浏览器不支持语音合成功能。",
    };
  }

  const voices = await loadJapaneseVoices(timeoutMs);
  return voices.length
    ? {
        supported: true,
        voices,
        message: `已找到 ${voices.length} 个日语语音。`,
      }
    : {
        supported: false,
        voices: [],
        message: "此设备没有可用的日语语音，请在系统中安装日语语音后重试。",
      };
}

export async function speakJapanese(text) {
  const requestId = ++playbackRequestId;
  const support = await getSpeechSupport();
  if (!support.supported) throw new Error(support.message);
  if (requestId !== playbackRequestId) return;

  const synth = window.speechSynthesis;
  // Ignore repeated clicks while the same kana is already being spoken.
  if (activeUtterance && lastSpokenText === text && (synth.speaking || synth.pending)) return;
  if (synth.speaking || synth.pending) {
    cancelSynthesis(synth);
  }

  const settleDelay = Math.max(0, CANCEL_SETTLE_MS - (Date.now() - lastCancelAt));
  if (lastCancelAt && settleDelay) await delay(settleDelay);
  if (requestId !== playbackRequestId) return;

  // Give the audio output a brief chance to settle before very short utterances.
  if (text.length <= 2) await delay(SHORT_KANA_WARMUP_MS);
  if (requestId !== playbackRequestId) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = JAPANESE_LANGUAGE;
  utterance.voice = chooseVoice(support.voices);
  utterance.rate = 0.88;
  utterance.pitch = 1;
  activeUtterance = utterance;
  lastSpokenText = text;

  return new Promise((resolve, reject) => {
    const finish = () => {
      if (activeUtterance === utterance) activeUtterance = null;
    };

    utterance.addEventListener("start", () => {
      lastSpeechStartAt = performance.now();
      console.debug("[kana speech] start", { text, voice: utterance.voice?.name });
    }, { once: true });

    utterance.addEventListener(
      "end",
      () => {
        console.debug("[kana speech] end", { text, durationMs: Math.round(performance.now() - lastSpeechStartAt) });
        finish();
        resolve();
      },
      { once: true },
    );

    utterance.addEventListener(
      "error",
      (event) => {
        console.debug("[kana speech] error", { text, error: event.error });
        finish();
        if (event.error === "interrupted" || event.error === "canceled") {
          resolve();
          return;
        }
        reject(
          new Error(
            event.error
              ? `发音失败：${event.error}`
              : "发音失败，请稍后重试。",
          ),
        );
      },
      { once: true },
    );

    synth.speak(utterance);
  });
}

export function stopSpeech() {
  playbackRequestId += 1;
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) cancelSynthesis(synth);
  activeUtterance = null;
}

async function loadJapaneseVoices(timeoutMs) {
  if (cachedJapaneseVoices) return cachedJapaneseVoices;
  if (voicesLoadingPromise) return voicesLoadingPromise;

  voicesLoadingPromise = new Promise((resolve) => {
    const filterJapaneseVoices = () => {
      const voices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
      if (voices.length) cachedJapaneseVoices = voices;
      return voices;
    };

    const initial = filterJapaneseVoices();
    if (initial.length) {
      resolve(initial);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      resolve(filterJapaneseVoices());
    };
    const handleVoicesChanged = () => {
      if (filterJapaneseVoices().length) finish();
    };

    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    window.setTimeout(finish, timeoutMs);
  });

  const result = await voicesLoadingPromise;
  voicesLoadingPromise = null;
  return result;
}

function cancelSynthesis(synth) {
  synth.cancel();
  lastCancelAt = Date.now();
}

function chooseVoice(voices) {
  return (
    voices.find((voice) => voice.name === "Microsoft Ayumi - Japanese (Japan)") ??
    voices.find((voice) => voice.name.includes("Ayumi")) ??
    voices.find((voice) => voice.default) ??
    voices.find((voice) => voice.localService) ??
    voices[0]
  );
}

function delay(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}
