const JAPANESE_LANGUAGE = "ja-JP";

export async function getSpeechSupport(timeoutMs = 1200) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return { supported: false, voices: [], message: "此浏览器不支持语音合成功能。" };
  }

  const voices = await loadVoices(timeoutMs);
  const japaneseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  return japaneseVoices.length
    ? { supported: true, voices: japaneseVoices, message: `已找到 ${japaneseVoices.length} 个日语语音。` }
    : { supported: false, voices: [], message: "此设备没有可用的日语语音，请在系统中安装日语语音后重试。" };
}

export async function speakJapanese(text) {
  const support = await getSpeechSupport();
  if (!support.supported) throw new Error(support.message);

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = JAPANESE_LANGUAGE;
  utterance.voice = chooseVoice(support.voices);
  utterance.rate = 0.88;
  utterance.pitch = 1;

  return new Promise((resolve, reject) => {
    utterance.addEventListener("end", resolve, { once: true });
    utterance.addEventListener(
      "error",
      (event) => reject(new Error(event.error ? `发音失败：${event.error}` : "发音失败，请稍后重试。")),
      { once: true },
    );
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

async function loadVoices(timeoutMs) {
  const initial = window.speechSynthesis.getVoices();
  if (initial.length) return initial;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

function chooseVoice(voices) {
  return voices.find((voice) => voice.default) ?? voices.find((voice) => voice.localService) ?? voices[0];
}
