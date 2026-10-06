const JAPANESE_LANGUAGE = "ja-JP";

let cachedJapaneseVoices = null;
let voicesLoadingPromise = null;

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
  const support = await getSpeechSupport();

  if (!support.supported) {
    throw new Error(support.message);
  }

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
      (event) => {
        // interrupted 通常只是上一段语音被新的播放请求主动取消，
        // 不属于真正的发音失败。
        if (event.error === "interrupted") {
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

    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function loadJapaneseVoices(timeoutMs) {
  if (cachedJapaneseVoices) {
    return cachedJapaneseVoices;
  }

  if (voicesLoadingPromise) {
    return voicesLoadingPromise;
  }

  voicesLoadingPromise = new Promise((resolve) => {
    const filterJapaneseVoices = () => {
      const voices = window.speechSynthesis
        .getVoices()
        .filter((voice) =>
          voice.lang.toLowerCase().startsWith("ja"),
        );

      if (voices.length) {
        cachedJapaneseVoices = voices;
      }

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

      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );

      const voices = filterJapaneseVoices();
      resolve(voices);
    };

    const handleVoicesChanged = () => {
      const voices = filterJapaneseVoices();

      if (voices.length) {
        finish();
      }
    };

    window.speechSynthesis.addEventListener(
      "voiceschanged",
      handleVoicesChanged,
    );

    window.setTimeout(finish, timeoutMs);
  });

  const result = await voicesLoadingPromise;
  voicesLoadingPromise = null;

  return result;
}

function chooseVoice(voices) {
  return (
    voices.find((voice) => voice.name === "Microsoft Ayumi - Japanese (Japan)") ??
    voices.find((voice) => voice.name.includes("Ayumi")) ??
    voices[0]
  );
}
