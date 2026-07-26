/**
 * Extracts the verification code from a verification email.
 *
 * Scoring beats a single regex here because real emails contain many number-like
 * strings; a code is only trustworthy when its length, character mix, and distance
 * to a phrase like "验证码" / "code" all line up.
 */

interface Keyword {
  text: string;
  weight: number;
}

/** Specific phrases outrank the bare word "code", which appears in unrelated copy too. */
const KEYWORDS: Keyword[] = [
  { text: "验证码", weight: 60 },
  { text: "校验码", weight: 60 },
  { text: "动态密码", weight: 60 },
  { text: "动态码", weight: 60 },
  { text: "验证代码", weight: 60 },
  { text: "安全代码", weight: 60 },
  { text: "安全码", weight: 60 },
  { text: "一次性密码", weight: 60 },
  { text: "verification code", weight: 60 },
  { text: "security code", weight: 60 },
  { text: "confirmation code", weight: 60 },
  { text: "authentication code", weight: 60 },
  { text: "one-time password", weight: 60 },
  { text: "one-time passcode", weight: 60 },
  { text: "one-time code", weight: 60 },
  { text: "single-use code", weight: 60 },
  { text: "access code", weight: 50 },
  { text: "login code", weight: 50 },
  { text: "verification", weight: 45 },
  { text: "passcode", weight: 45 },
  { text: "otp", weight: 45 },
  { text: "code", weight: 35 },
];

const LENGTH_SCORES: Record<number, number> = {
  4: 20,
  5: 18,
  6: 30,
  7: 14,
  8: 16,
};

const PURE_DIGIT_BONUS = 10;
const MIXED_ALNUM_BONUS = 2;
const SUBJECT_BONUS = 15;
const AFTER_WINDOW = 40;
const BEFORE_WINDOW = 30;
const MIN_SCORE = 40;

/**
 * Blanks out text that looks like a code but never is: URLs, addresses, dates,
 * times, versions, and long digit runs. Replacing with spaces of equal length
 * keeps every remaining offset accurate for the proximity scoring below.
 */
const NOISE_PATTERNS: RegExp[] = [
  /https?:\/\/\S+/gi,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g,
  /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/g,
  /\d{1,2}:\d{2}(?::\d{2})?/g,
  /\d+(?:\.\d+){2,}/g,
  /\d{9,}/g,
];

function scrub(text: string): string {
  let result = text;
  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, (match) => " ".repeat(match.length));
  }
  return result;
}

function keywordPositions(lowerText: string): Array<{ start: number; end: number; weight: number }> {
  const positions: Array<{ start: number; end: number; weight: number }> = [];
  for (const keyword of KEYWORDS) {
    let from = 0;
    for (;;) {
      const index = lowerText.indexOf(keyword.text, from);
      if (index === -1) break;
      positions.push({ start: index, end: index + keyword.text.length, weight: keyword.weight });
      from = index + keyword.text.length;
    }
  }
  return positions;
}

function proximityBonus(
  candidateStart: number,
  candidateEnd: number,
  keywords: Array<{ start: number; end: number; weight: number }>,
): number {
  let best = 0;
  for (const keyword of keywords) {
    let distance: number;
    let window: number;
    if (candidateStart >= keyword.end) {
      distance = candidateStart - keyword.end;
      window = AFTER_WINDOW;
    } else if (candidateEnd <= keyword.start) {
      distance = keyword.start - candidateEnd;
      window = BEFORE_WINDOW;
    } else {
      continue;
    }
    if (distance >= window) continue;
    best = Math.max(best, keyword.weight * (1 - distance / window));
  }
  return best;
}

function scoreText(text: string, isSubject: boolean, scores: Map<string, number>) {
  const scrubbed = scrub(text);
  const keywords = keywordPositions(scrubbed.toLowerCase());
  // Bounded 4-8 char runs holding at least one digit; \b keeps us off longer tokens.
  const candidatePattern = /\b(?=[A-Za-z0-9]{4,8}\b)(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+\b/g;

  for (const match of scrubbed.matchAll(candidatePattern)) {
    const code = match[0];
    const start = match.index;
    const end = start + code.length;

    let score = LENGTH_SCORES[code.length] ?? 0;
    score += /^\d+$/.test(code) ? PURE_DIGIT_BONUS : MIXED_ALNUM_BONUS;
    score += proximityBonus(start, end, keywords);
    if (isSubject) score += SUBJECT_BONUS;

    const previous = scores.get(code) ?? 0;
    if (score > previous) scores.set(code, score);
  }
}

/**
 * Returns the most likely verification code, or null when nothing scores high
 * enough to show without annoying the user.
 */
export function extractVerificationCode(subject: string, body: string): string | null {
  const scores = new Map<string, number>();
  scoreText(subject || "", true, scores);
  scoreText(body || "", false, scores);

  let bestCode: string | null = null;
  let bestScore = 0;
  for (const [code, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }

  return bestScore >= MIN_SCORE ? bestCode : null;
}
