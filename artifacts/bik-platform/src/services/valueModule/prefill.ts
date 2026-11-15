import type { ValueField, ValueInputs } from './compute';
import { parseValueNumber } from './compute';
import { answerCurrency, type ValueCurrency } from './currency';

export interface ValueStoreInput {
  userName?: string; companyName?: string; sectorL1?: string; sectorL2?: string;
  intakeAnswers?: Record<string, unknown>; universalAnswers?: Record<string, unknown>; sectorAnswers?: Record<string, unknown>;
}
export const FINANCIAL_FIELDS: readonly ValueField[] = ['unitNet', 'monthlyWaste', 'monthlyRevenue'];
export const VALUE_FIELDS: readonly ValueField[] = ['unitNet', 'margin', 'lostUnits', 'dormantCount', 'returnsPerYear', 'monthlyUnits', 'underPct', 'monthlyWaste', 'monthlyRevenue'];
/** Only directly equivalent values; absence is not a licence to derive quantities or margins. */
export const VALUE_PREFILL_MAP = {
  unitNet: { healthcare: ['hd01', 'u34'], retail: ['rd03', 'u34'], realestate: ['red02'], construction: ['cod01', 'u34'], general: ['u34'] },
  monthlyRevenue: { professional: ['prd01', 'u31'], general: ['ud01', 'u31'] }
} as const;
export interface PrefilledValue { value: number; source: string }
export function valuePrefills(store: ValueStoreInput, currency: ValueCurrency) {
  const originalCurrency = answerCurrency(store.universalAnswers?.u35, store.intakeAnswers?.country);
  const fields: Partial<Record<ValueField, PrefilledValue>> = {};
  if (currency !== originalCurrency) return { originalCurrency, fields };
  const sector = store.sectorL1 || '';
  const unitIds = VALUE_PREFILL_MAP.unitNet[sector as keyof typeof VALUE_PREFILL_MAP.unitNet] || VALUE_PREFILL_MAP.unitNet.general;
  const revenueIds = sector === 'professional' ? VALUE_PREFILL_MAP.monthlyRevenue.professional : VALUE_PREFILL_MAP.monthlyRevenue.general;
  for (const [field, ids] of [['unitNet', unitIds], ['monthlyRevenue', revenueIds]] as const) {
    for (const id of ids) {
      // Questionnaire persists every u-prefixed ID here, including the universal deep ud01.
      const raw = id.startsWith('u') ? store.universalAnswers?.[id] : store.sectorAnswers?.[id];
      const value = parseValueNumber(raw);
      if (value !== null) { fields[field] = { value, source: id }; break; }
    }
  }
  return { originalCurrency, fields };
}
export const valueIdentity = (store: ValueStoreInput) => ({
  company: typeof store.companyName === 'string' && store.companyName.trim() ? store.companyName : '',
  context: [store.userName, store.companyName, store.sectorL2 || store.sectorL1, store.intakeAnswers?.city, store.intakeAnswers?.country]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join('، ')
});

export type ValueDrafts = Partial<Record<ValueField, { text: string; basis: string }>>;
export function resolveValueFields(drafts: ValueDrafts, prefilled: Partial<Record<ValueField, PrefilledValue>>, currency: ValueCurrency) {
  const basis = (field: ValueField) => JSON.stringify([FINANCIAL_FIELDS.includes(field) ? currency : '', prefilled[field] || null]);
  const inputs: ValueInputs = {};
  const tags: Partial<Record<ValueField, boolean>> = {};
  for (const field of VALUE_FIELDS) {
    const own = drafts[field];
    const isOwn = own && own.basis === basis(field);
    inputs[field] = isOwn ? own.text : prefilled[field]?.value ?? '';
    tags[field] = !isOwn && prefilled[field] !== undefined;
  }
  return { inputs, tags, basis };
}
