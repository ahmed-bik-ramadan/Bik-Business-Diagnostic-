const knownCallingCodes = [
  '966', '971', '965', '974', '973', '962', '212', '216', '20',
  '968', '964', '218', '970', '249', '961', '213',
  '1', '7', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44',
  '45', '46', '47', '48', '49', '52', '55', '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '98'
].sort((a, b) => b.length - a.length);

function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/gu, digit => {
    const codePoint = digit.codePointAt(0) ?? 0;
    const zero = codePoint >= 0x06f0 && codePoint <= 0x06f9 ? 0x06f0 : 0x0660;
    return String(codePoint - zero);
  });
}

/**
 * Produces an E.164-style value for the optional handoff dossier. Explicit
 * international input is respected; local trunk zeroes are removed once.
 */
export function normalizePhoneNumber(countryDialCode: string, input: string): string | null {
  const value = toAsciiDigits(input.trim());
  const explicitInternational = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/\D/gu, '');

  if (explicitInternational) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    const detectedCode = knownCallingCodes.find(code => digits.startsWith(code));
    if (detectedCode && digits.slice(detectedCode.length).startsWith('0')) {
      digits = `${detectedCode}${digits.slice(detectedCode.length + 1)}`;
    }
  } else {
    const selectedCode = countryDialCode.replace(/\D/gu, '');
    if (!selectedCode || selectedCode === '00') return null;
    // Saved digits may include the selected calling code. A national-length
    // number can legitimately start with the same digits as that code.
    const example = NATIONAL_NUMBER_EXAMPLES[`+${selectedCode}`];
    if (digits.startsWith(selectedCode) && (!example || digits.length > example.length)) {
      digits = digits.slice(selectedCode.length);
    }
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = `${selectedCode}${digits}`;
  }

  if (!/^[1-9]\d{6,14}$/u.test(digits)) return null;
  return `+${digits}`;
}

export function splitPhoneForForm(value: string, countryDialCodes: string[]): { dialCode: string; nationalNumber: string } {
  const ascii = toAsciiDigits(value.trim());
  const digits = ascii.replace(/\D/gu, '').replace(/^00/u, '');
  const hasPrefix = ascii.startsWith('+') || ascii.startsWith('00');
  const candidates = countryDialCodes
    .filter(code => code !== '+00')
    .sort((a, b) => b.length - a.length);
  const matchedCode = candidates.find(code => {
    const codeDigits = code.replace(/\D/gu, '');
    const example = NATIONAL_NUMBER_EXAMPLES[code];
    return codeDigits && digits.startsWith(codeDigits) && (hasPrefix || !example || digits.length > example.length);
  });
  if (!matchedCode) return { dialCode: '+00', nationalNumber: value };
  const codeDigits = matchedCode.replace(/\D/gu, '');
  return { dialCode: matchedCode, nationalNumber: digits.slice(codeDigits.length).replace(/^0/u, '') };
}

/** Example national mobile numbers WITHOUT the trunk zero, shown next to the selected country code. */
export const NATIONAL_NUMBER_EXAMPLES: Record<string, string> = {
  '+20': '1012345678',
  '+966': '512345678',
  '+971': '501234567',
  '+965': '51234567',
  '+974': '33123456',
  '+973': '36001234',
  '+962': '791234567',
  '+212': '612345678',
  '+216': '20123456',
  '+968': '91234567',
  '+964': '7901234567',
  '+218': '912345678',
  '+970': '599123456',
  '+249': '912345678',
  '+961': '71123456',
  '+213': '551234567'
};

/**
 * Clean the text while editing. Keep an explicit international prefix and
 * retain a lone zero until the next keystroke can distinguish 00 from a local trunk prefix.
 */
export function sanitizeNationalInput(countryDialCode: string, raw: string): string {
  const ascii = toAsciiDigits(raw).replace(/[^\d+]/gu, '').replace(/(?!^)\+/gu, '');
  if (countryDialCode === '+00' || ascii === '0' || ascii.startsWith('+') || ascii.startsWith('00')) return ascii;
  return ascii.replace(/^0/u, '');
}
