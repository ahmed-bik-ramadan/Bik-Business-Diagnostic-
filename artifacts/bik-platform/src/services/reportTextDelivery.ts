export interface WhatsAppReportPart {
  body: string;
  message: string;
  label: string;
}

/** Each part travels inside the wa.me link itself, so parts stay short (about 1100 characters). */
export const WHATSAPP_MESSAGE_LIMIT = 1100;
/** Bounds encoded Arabic/emoji payloads independently from their visible character count. */
export const WHATSAPP_ENCODED_MESSAGE_LIMIT = 6000;

function header(index: number, count: number): string {
  return `الجزء ${index} من ${count}\n\n`;
}

function sentenceUnits(text: string): string[] {
  const chars = Array.from(text);
  const units: string[] = [];
  let start = 0;

  for (let index = 0; index < chars.length; index += 1) {
    const paragraphBreak = chars[index] === '\n' && chars[index + 1] === '\n';
    const sentenceBreak = /[.!?؟؛…]/u.test(chars[index])
      && (index + 1 === chars.length || /\s/u.test(chars[index + 1]));
    if (!paragraphBreak && !sentenceBreak) continue;

    let end = index + 1;
    if (paragraphBreak) {
      while (end < chars.length && chars[end] === '\n') end += 1;
    } else {
      while (end < chars.length && (chars[end] === ' ' || chars[end] === '\t')) end += 1;
    }
    units.push(chars.slice(start, end).join(''));
    start = end;
    index = end - 1;
  }

  if (start < chars.length) units.push(chars.slice(start).join(''));
  return units.length ? units : [text];
}

/**
 * Keeps an answer ("↳ ...") with its question and a heading ("*...*") with what follows it, so a part
 * never opens with an orphan answer or closes on a bare heading. Used only when every glued block still fits.
 */
function glueBlocks(units: string[]): string[] {
  const glued: string[] = [];
  let carry = '';
  for (const unit of units) {
    const text = carry + unit;
    carry = '';
    if (glued.length && unit.trimStart().startsWith('↳')) {
      glued[glued.length - 1] += unit;
      continue;
    }
    if (/^\s*\*[^*\n]+\*\s*$/u.test(unit)) {
      carry = text;
      continue;
    }
    glued.push(text);
  }
  if (carry) glued.push(carry);
  return glued;
}

function fits(body: string, index: number, count: number, maxChars: number): boolean {
  const message = `${header(index + 1, count)}${body}`;
  return Array.from(message).length <= maxChars
    && encodeURIComponent(message).length <= WHATSAPP_ENCODED_MESSAGE_LIMIT;
}

function packUnits(units: string[], expectedCount: number, maxChars: number): string[] {
  const bodies: string[] = [];
  let body = '';

  for (const unit of units) {
    if (fits(body + unit, bodies.length, expectedCount, maxChars)) {
      body += unit;
      continue;
    }

    if (!body) {
      throw new RangeError('A report sentence exceeds the encoded message limit.');
    }
    bodies.push(body);
    body = unit;
    if (!fits(body, bodies.length, expectedCount, maxChars)) {
      throw new RangeError('A report sentence exceeds the encoded message limit.');
    }
  }

  if (body) bodies.push(body);
  return bodies;
}

export function buildWhatsAppReportParts(text: string, _legacySessionRef = '', maxChars = WHATSAPP_MESSAGE_LIMIT): WhatsAppReportPart[] {
  if (!text) return [];
  if (!Number.isInteger(maxChars) || maxChars < 32) throw new RangeError('Invalid message budget');

  let expectedCount = 1;
  let bodies: string[] = [];
  let converged = false;
  const units = sentenceUnits(text);

  // The Arabic header depends on the final count, so pack again until it is stable.
  for (let attempt = 0; attempt < 32; attempt += 1) {
    try {
      bodies = packUnits(glueBlocks(units), expectedCount, maxChars);
    } catch (cause) {
      if (!(cause instanceof RangeError)) throw cause;
      // A glued block is longer than one part: fall back to plain sentence splitting.
      bodies = packUnits(units, expectedCount, maxChars);
    }
    if (bodies.length === expectedCount) {
      converged = true;
      break;
    }
    expectedCount = bodies.length;
  }

  if (!converged) throw new Error('Could not calculate a stable report-part count');

  return bodies.map((body, index) => {
    const partHeader = header(index + 1, bodies.length);
    const message = `${partHeader}${body}`;
    if (!fits(body, index, bodies.length, maxChars)) throw new Error('Report part exceeds its encoded message budget');
    return {
      body,
      message,
      label: `الجزء ${index + 1} من ${bodies.length}`
    };
  });
}
