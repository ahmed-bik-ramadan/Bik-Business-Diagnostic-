import { FX_AS_OF, FX_RATES_PER_USD } from '../../config/appConfig';
import { platformCopy } from '../../copy/platformCopy';

export type ValueCurrency = keyof typeof FX_RATES_PER_USD;
export const VALUE_CURRENCIES: readonly ValueCurrency[] = ['SAR', 'AED', 'EGP', 'KWD', 'QAR', 'USD'];
const COUNTRIES: Readonly<Record<string, ValueCurrency>> = { 'مصر': 'EGP', 'السعودية': 'SAR', 'الإمارات': 'AED', 'الكويت': 'KWD', 'قطر': 'QAR' };

export function currencyForCountry(country: unknown): ValueCurrency {
  return typeof country === 'string' && Object.hasOwn(COUNTRIES, country) ? COUNTRIES[country] : 'USD';
}

export function answerCurrency(answer: unknown, country: unknown): ValueCurrency {
  return typeof answer === 'string' && VALUE_CURRENCIES.includes(answer as ValueCurrency) ? answer as ValueCurrency
    : currencyForCountry(country);
}
export const currencyName = (currency: ValueCurrency) => platformCopy[`value.currency.${currency}`];
export const currencyUnit = (currency: ValueCurrency) => platformCopy[`value.currencyUnit.${currency}`];
export const formatValueNumber = (value: number, decimals = 2): string => new Intl.NumberFormat('en-US', {
  useGrouping: true, maximumFractionDigits: decimals
}).format(value);
export const formatValueAmount = (value: number, currency: ValueCurrency): string => `${formatValueNumber(value, currency === 'KWD' ? 3 : 2)} ${currencyUnit(currency)}`;
/** Format the field without discarding a decimal point still being typed. */
export function displayValueInput(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).replace(/[\s,،٬]/gu, '').replace(/٫/g, '.');
  if (!/^\d*(?:\.\d*)?$/.test(text)) return text;
  const [integer, fraction] = text.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
}
export function fxFreshness(asOf: string = FX_AS_OF, now = new Date()) {
  const date = Date.parse(asOf + 'T00:00:00Z');
  const ageDays = Math.floor((now.getTime() - date) / 86400000);
  return { ageDays, stale: !Number.isFinite(date) || ageDays > 45 };
}
