// Converts digits to spoken English so ElevenLabs reads them naturally.
// Applied only at the TTS boundary — script DB rows keep digit-form text
// so captions, visual cues, and analytics are unaffected.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
  "eighty", "ninety",
];

const ORDINAL_WORDS: Record<number, string> = {
  1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
  6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
  11: "eleventh", 12: "twelfth", 13: "thirteenth", 14: "fourteenth",
  15: "fifteenth", 16: "sixteenth", 17: "seventeenth", 18: "eighteenth",
  19: "nineteenth", 20: "twentieth", 30: "thirtieth", 40: "fortieth",
  50: "fiftieth", 60: "sixtieth", 70: "seventieth", 80: "eightieth",
  90: "ninetieth",
};

function intToWords(n: number): string {
  if (n < 0) return `negative ${intToWords(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
  }
  if (n < 1_000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? `${ONES[h]} hundred` : `${ONES[h]} hundred ${intToWords(r)}`;
  }
  const scales: Array<[number, string]> = [
    [1_000_000_000_000, "trillion"],
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  for (const [value, name] of scales) {
    if (n >= value) {
      const high = Math.floor(n / value);
      const r = n % value;
      const head = `${intToWords(high)} ${name}`;
      return r === 0 ? head : `${head} ${intToWords(r)}`;
    }
  }
  return ONES[n]; // unreachable
}

function decimalToWords(s: string): string {
  const [intPart, decPart] = s.split(".");
  const intWords = intToWords(parseInt(intPart, 10));
  const decWords = decPart
    .split("")
    .map((d) => ONES[parseInt(d, 10)])
    .join(" ");
  return `${intWords} point ${decWords}`;
}

function numericStringToWords(s: string): string {
  const cleaned = s.replace(/,/g, "");
  if (cleaned.includes(".")) return decimalToWords(cleaned);
  return intToWords(parseInt(cleaned, 10));
}

function yearToWords(year: number): string {
  // 2000–2009 read as "two thousand (n)"
  if (year >= 2000 && year < 2010) {
    return year === 2000 ? "two thousand" : `two thousand ${ONES[year - 2000]}`;
  }
  // Otherwise split into two two-digit halves: 1994 → nineteen ninety four
  const high = Math.floor(year / 100);
  const low = year % 100;
  const highWords = intToWords(high);
  if (low === 0) return `${highWords} hundred`;
  if (low < 10) return `${highWords} oh ${ONES[low]}`;
  return `${highWords} ${intToWords(low)}`;
}

function ordinalToWords(n: number): string {
  if (ORDINAL_WORDS[n]) return ORDINAL_WORDS[n];
  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    if (ones === 0) return ORDINAL_WORDS[tens] ?? `${intToWords(n)}th`;
    return `${TENS[tens / 10]} ${ORDINAL_WORDS[ones]}`;
  }
  // Fallback: "<cardinal>th". Rare in short-form scripts.
  return `${intToWords(n)}th`;
}

/**
 * Convert numeric forms in `text` to spoken English.
 *
 * Order matters: more specific patterns (currency, percent, ordinals) run
 * before general ones (bare integers) so the specific form claims the digits
 * first.
 */
export function normalizeNumbersForSpeech(text: string): string {
  let result = text;

  // Currency followed by a magnitude word: "$1.5 million" → "one point five million dollars"
  result = result.replace(
    /\$(\d+(?:\.\d+)?)\s+(trillion|billion|million|thousand)\b/gi,
    (_, num, mag) => `${numericStringToWords(num)} ${mag.toLowerCase()} dollars`
  );

  // Plain currency: "$200,000", "$5", "$1.5" → "... dollars"
  result = result.replace(
    /\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g,
    (_, num) => `${numericStringToWords(num)} dollars`
  );

  // Percent followed by magnitude word: "5 million percent" — leave alone (handled by bare-int pass)

  // Percentages: "5%", "2.5%" → "five percent", "two point five percent"
  result = result.replace(
    /(\d+(?:\.\d+)?)%/g,
    (_, num) => `${numericStringToWords(num)} percent`
  );

  // Multipliers: "10x", "2.5x" → "ten times", "two point five times"
  result = result.replace(
    /\b(\d+(?:\.\d+)?)x\b/gi,
    (_, num) => `${numericStringToWords(num)} times`
  );

  // Ordinals: "1st", "2nd", "3rd", "21st" → "first", "second", "third", "twenty first"
  result = result.replace(
    /\b(\d+)(st|nd|rd|th)\b/gi,
    (_, num) => ordinalToWords(parseInt(num, 10))
  );

  // Years: "1994", "2024" → "nineteen ninety four", "twenty twenty four"
  // Heuristic: 4-digit numbers in 1900–2099, not preceded by a digit/dot.
  result = result.replace(
    /\b(19\d{2}|20\d{2})\b/g,
    (_, y) => yearToWords(parseInt(y, 10))
  );

  // Comma numbers: "200,000" → "two hundred thousand"
  result = result.replace(
    /\b\d{1,3}(?:,\d{3})+\b/g,
    (m) => intToWords(parseInt(m.replace(/,/g, ""), 10))
  );

  // Decimals: "3.5" → "three point five"
  result = result.replace(/\b\d+\.\d+\b/g, (m) => decimalToWords(m));

  // Bare integers: "42" → "forty two"
  result = result.replace(/\b\d+\b/g, (m) => intToWords(parseInt(m, 10)));

  return result;
}
