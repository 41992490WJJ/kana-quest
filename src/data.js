const BASIC_ROW_DEFINITIONS = [
  { id: "a", name: "あ行", sounds: [["あ", "ア", "a"], ["い", "イ", "i"], ["う", "ウ", "u"], ["え", "エ", "e"], ["お", "オ", "o"]] },
  { id: "ka", name: "か行", sounds: [["か", "カ", "ka"], ["き", "キ", "ki"], ["く", "ク", "ku"], ["け", "ケ", "ke"], ["こ", "コ", "ko"]] },
  { id: "sa", name: "さ行", sounds: [["さ", "サ", "sa"], ["し", "シ", "shi"], ["す", "ス", "su"], ["せ", "セ", "se"], ["そ", "ソ", "so"]] },
  { id: "ta", name: "た行", sounds: [["た", "タ", "ta"], ["ち", "チ", "chi"], ["つ", "ツ", "tsu"], ["て", "テ", "te"], ["と", "ト", "to"]] },
  { id: "na", name: "な行", sounds: [["な", "ナ", "na"], ["に", "ニ", "ni"], ["ぬ", "ヌ", "nu"], ["ね", "ネ", "ne"], ["の", "ノ", "no"]] },
  { id: "ha", name: "は行", sounds: [["は", "ハ", "ha"], ["ひ", "ヒ", "hi"], ["ふ", "フ", "fu"], ["へ", "ヘ", "he"], ["ほ", "ホ", "ho"]] },
  { id: "ma", name: "ま行", sounds: [["ま", "マ", "ma"], ["み", "ミ", "mi"], ["む", "ム", "mu"], ["め", "メ", "me"], ["も", "モ", "mo"]] },
  { id: "ya", name: "や行", sounds: [["や", "ヤ", "ya"], ["ゆ", "ユ", "yu"], ["よ", "ヨ", "yo"]] },
  { id: "ra", name: "ら行", sounds: [["ら", "ラ", "ra"], ["り", "リ", "ri"], ["る", "ル", "ru"], ["れ", "レ", "re"], ["ろ", "ロ", "ro"]] },
  { id: "wa", name: "わ行", sounds: [["わ", "ワ", "wa"], ["を", "ヲ", "wo"]] },
  { id: "n", name: "ん", sounds: [["ん", "ン", "n"]] },
];

const CONFUSABLES = {
  "a-hira": ["o-hira"],
  "o-hira": ["a-hira"],
  "i-hira": ["ri-hira"],
  "ri-hira": ["i-hira"],
  "u-hira": ["ra-hira"],
  "ra-hira": ["u-hira"],
  "ki-hira": ["sa-hira"],
  "sa-hira": ["ki-hira"],
  "nu-hira": ["me-hira", "ne-hira"],
  "me-hira": ["nu-hira"],
  "ne-hira": ["nu-hira", "re-hira", "wa-hira"],
  "re-hira": ["ne-hira", "wa-hira"],
  "wa-hira": ["ne-hira", "re-hira"],
  "ha-hira": ["ho-hira"],
  "ho-hira": ["ha-hira"],
  "ru-hira": ["ro-hira"],
  "ro-hira": ["ru-hira"],
  "shi-kata": ["tsu-kata"],
  "tsu-kata": ["shi-kata"],
  "so-kata": ["n-kata"],
  "n-kata": ["so-kata"],
  "u-kata": ["wa-kata", "fu-kata"],
  "wa-kata": ["u-kata", "fu-kata"],
  "fu-kata": ["u-kata", "wa-kata"],
  "ku-kata": ["ke-kata"],
  "ke-kata": ["ku-kata"],
  "ma-kata": ["mu-kata"],
  "mu-kata": ["ma-kata"],
  "nu-kata": ["su-kata"],
  "su-kata": ["nu-kata"],
  "me-kata": ["na-kata"],
  "na-kata": ["me-kata"],
  "a-kata": ["ya-kata"],
  "ya-kata": ["a-kata"],
  "chi-kata": ["te-kata"],
  "te-kata": ["chi-kata"],
  "ko-kata": ["yu-kata"],
  "yu-kata": ["ko-kata"],
};

function createKana(rowId, hira, kata, romaji, script) {
  const id = `${romaji}-${script}`;
  return {
    id,
    hira,
    kata,
    script,
    romaji,
    row: rowId,
    group: "basic",
    confusables: CONFUSABLES[id] ?? [],
  };
}

export const ROWS = BASIC_ROW_DEFINITIONS.map((row, order) => ({
  id: row.id,
  name: row.name,
  order,
  group: "basic",
  kana: [
    ...row.sounds.map(([hira, kata, romaji]) => createKana(row.id, hira, kata, romaji, "hira")),
    ...row.sounds.map(([hira, kata, romaji]) => createKana(row.id, hira, kata, romaji, "kata")),
  ],
}));

export const ALL_KANA = ROWS.flatMap((row) => row.kana);
export const ALL_ROMAJI = [...new Set(ALL_KANA.map((kana) => kana.romaji))];
export const KANA_BY_ID = Object.fromEntries(ALL_KANA.map((kana) => [kana.id, kana]));

export const COURSE_GROUPS = [
  { id: "basic", name: "基础清音", rowIds: ROWS.map((row) => row.id) },
  { id: "dakuten", name: "浊音", rowIds: [] },
  { id: "handakuten", name: "半浊音", rowIds: [] },
  { id: "yoon", name: "拗音", rowIds: [] },
  { id: "sokuon", name: "促音", rowIds: [] },
  { id: "long-vowel", name: "长音", rowIds: [] },
];
