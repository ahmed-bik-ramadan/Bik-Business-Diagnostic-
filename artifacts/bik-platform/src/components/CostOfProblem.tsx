import React, { useState } from 'react';
import { platformCopy, formatPlatformCopy } from '../copy/platformCopy';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { FX_AS_OF, FX_RATES_PER_USD } from '../config/appConfig';
import { caseStudies } from '../data/caseStudies';
import { computeCostOfProblem, parseValueNumber, VALUE_ESTIMATE_LABEL, type ValueField } from '../services/valueModule/compute';
import { sectorPool, selectValuePaths } from '../services/valueModule/sectorPools';
import { currencyForCountry, currencyName, displayValueInput, formatValueAmount, formatValueNumber } from '../services/valueModule/currency';
import { FINANCIAL_FIELDS, resolveValueFields, valueIdentity, valuePrefills, type ValueDrafts } from '../services/valueModule/prefill';
import { VALUE_OFFERS, valueOfferRows } from '../services/valueModule/offers';

const comparisonOffers = VALUE_OFFERS.map(offer => ({
  ...offer, priceLabel: `${offer.priceLabel} (${VALUE_ESTIMATE_LABEL})`
}));

export default function CostOfProblem() {
  const store = useDiagnosticStore();
  const [drafts, setDrafts] = useState<ValueDrafts>({});
  const currency = currencyForCountry(store.intakeAnswers.country);
  const { fields: prefilled } = valuePrefills(store, currency);
  const resolved = resolveValueFields(drafts, prefilled, currency);
  const paths = selectValuePaths(store.sectorL1, store.axisDetails);
  const pool = sectorPool(store.sectorL1);
  const result = computeCostOfProblem(resolved.inputs, paths);
  const identity = valueIdentity(store);
  const examples = caseStudies.filter(example => example.sector === store.sectorL1);
  const amount = (number: number | null) => number === null ? platformCopy['value.notCalculated'] : `${formatValueAmount(number, currency)} (${VALUE_ESTIMATE_LABEL})`;
  const field = (key: ValueField, label: string) => {
    const raw = resolved.inputs[key];
    const parsed = parseValueNumber(raw);
    const invalid = String(raw ?? '').trim() !== '' && (parsed === null || (key === 'margin' && parsed > 100));
    return <div className="min-w-0">
      <label htmlFor={`value-${key}`} className="block text-xs font-bold leading-5 text-[#0F172A]">
        {label}{FINANCIAL_FIELDS.includes(key) && <span className="mr-1 font-normal">({VALUE_ESTIMATE_LABEL})</span>}{resolved.tags[key] && <span className="mr-1 font-normal text-[#68717A]" data-testid={`value-prefilled-${key}`}>{platformCopy['value.prefilled']}</span>}
      </label>
      <input id={`value-${key}`} type="text" inputMode="numeric" autoComplete="off" aria-invalid={invalid}
        value={displayValueInput(raw)} data-testid={`value-field-${key}`} dir="rtl"
        onChange={event => { const text = event.target.value; setDrafts(previous => ({ ...previous, [key]: { text, basis: resolved.basis(key) } })); }}
        className="mt-1 block min-h-11 w-full rounded-xl border border-[#0F172A]/20 bg-white p-3 text-lg leading-8! text-[#0F172A] focus:outline-[#C9A961]" />
    </div>;
  };
  const pathResult = (index: number) => {
    if (result.noRevenue) return null;
    const row = result.paths[index];
    return <div><output className={`block rounded-xl bg-[#F6F0DF] px-3 py-2 text-sm leading-6 ${row.status === 'needMargin' ? 'text-[#8A3F32]' : 'text-[#26354E]'}`}
      data-testid={`value-result-${row.path}`}>
      {row.status === 'needMargin' ? platformCopy['value.needMargin'] : row.amount === null ? platformCopy['value.notCalculated']
        : formatPlatformCopy('value.monthlyAmount', { amount: amount(row.amount) })}
    </output>
      {result.overlapExcluded === row.path && <p className="mt-1 text-xs leading-5">لا يُجمع الأثران لأنهما يتقاطعان</p>}
    </div>;
  };

  return <details className="rounded-[1.7rem] border border-[#C9A961]/35 bg-[#FBFAF6] p-5 md:p-7" data-testid="cost-of-problem">
    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 font-bold text-[#0F172A]">
      <span className="font-display text-xl leading-7 break-words">{identity.company ? formatPlatformCopy('value.title', { company: identity.company }) : platformCopy['value.titleFallback']}</span>
      <span className="rounded-full bg-[#F6F0DF] px-3 py-1 text-xs font-bold text-[#92763D]">{platformCopy['value.badge']}</span>
      {result.noRevenue && <span className="basis-full text-sm" role="status">لم يُدخل إيراد، فنعرض الأولويات دون تقدير مالي</span>}
    </summary>
    {identity.context && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[#68717A]" data-testid="value-context">{identity.context}</p>}
    <p className="mt-2 text-sm leading-6 text-[#68717A]">{platformCopy['value.intro']}</p>
    <div className="mt-3 grid grid-cols-2 items-end gap-3 md:grid-cols-3">
      {field('unitNet', formatPlatformCopy('value.unitNetLabel', { unit: platformCopy[pool.unit] }))}
      {field('margin', formatPlatformCopy('value.marginLabel', { currency: currencyName(currency) }))}
      {field('monthlyRevenue', platformCopy['value.revenueLabel'])}
    </div>
    <div className="mt-3 space-y-3" aria-live="polite" data-testid="value-paths">
      <div className="grid grid-cols-2 items-end gap-3">
        {field('lostUnits', platformCopy[pool.lost])}{pathResult(0)}
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        {field('dormantCount', platformCopy[pool.dormant])}{field('returnsPerYear', platformCopy['value.returnsPerYearLabel'])}
        <div className="col-span-2">{pathResult(1)}</div>
      </div>
      {paths[2] === 'P' ? <div className="grid grid-cols-2 items-end gap-3">
        {field('monthlyUnits', platformCopy[pool.monthlyUnits])}{field('underPct', platformCopy[pool.priceGap])}
        <div className="col-span-2">{pathResult(2)}</div>
      </div> : <div className="grid grid-cols-2 items-end gap-3">
        {field('monthlyWaste', platformCopy[pool.waste])}{pathResult(2)}
      </div>}
    </div>
    {result.inconsistentSales && <p className="mt-2 text-sm leading-6 text-[#8A3F32]" role="status">الأرقام المدخلة لا تتسق؛ راجعها</p>}
    {!result.noRevenue && <>
      <div className="mt-3 rounded-xl bg-[#F6F0DF] p-3 text-[#26354E]" aria-live="polite" data-testid="value-totals">
        <p className="text-sm font-bold leading-6">{platformCopy['value.totalLabel']}: <output data-testid="value-total">{amount(result.total)}</output></p>
        <p className="mt-1 text-xs leading-5" data-testid="value-yearly">{result.yearly === null ? platformCopy['value.notCalculated'] : formatPlatformCopy('value.yearly', { amount: amount(result.yearly) })}</p>
        {result.capped && <p className="mt-2 text-xs leading-5 text-[#8A3F32]" data-testid="value-cap">{platformCopy['value.capNote']}</p>}
      </div>
      <p className="mt-3 text-sm font-bold leading-6">{platformCopy['value.offersIntro']}</p>
      <div className="mt-2 space-y-2 text-xs leading-5 text-[#26354E]" data-testid="value-offers">
        {valueOfferRows(result.total, currency, comparisonOffers).map(row => <p key={row.key} data-testid={`value-offer-${row.key}`}>{row.text}</p>)}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#68717A]" data-testid="value-fx-note">{formatPlatformCopy('value.fxNote', {
        rate: formatValueNumber(FX_RATES_PER_USD[currency], 4), currency: `${currencyName(currency)} (${VALUE_ESTIMATE_LABEL})`, date: FX_AS_OF
      })}</p>
    </>}
    {examples.map((example, index) => <div key={index} className="mt-3 rounded-xl bg-[#F6F0DF] p-3 text-sm leading-6" data-testid="value-case-study">
      <p className="font-bold">{platformCopy['value.caseTitle']}</p><p>{example.beforeAfter}</p>
      <p>{formatPlatformCopy('value.caseMonths', { months: formatValueNumber(example.months) })}</p><p>{example.note}</p>
    </div>)}
    <p className="mt-2 text-xs leading-5 text-[#68717A]">{platformCopy['value.disclaimer']}</p>
  </details>;
}
