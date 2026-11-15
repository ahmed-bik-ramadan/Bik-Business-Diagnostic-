import React, { useState } from 'react';
import { platformCopy, formatPlatformCopy } from '../copy/platformCopy';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { FX_AS_OF, FX_RATES_PER_USD } from '../config/appConfig';
import { caseStudies } from '../data/caseStudies';
import { computeCostOfProblem, parseValueNumber, type ScenarioShare, type ValueField } from '../services/valueModule/compute';
import { sectorPool, selectValuePaths } from '../services/valueModule/sectorPools';
import { answerCurrency, currencyName, displayValueInput, formatValueAmount, formatValueNumber, indianDigits, VALUE_CURRENCIES, type ValueCurrency } from '../services/valueModule/currency';
import { FINANCIAL_FIELDS, resolveValueFields, valueIdentity, valuePrefills, type ValueDrafts } from '../services/valueModule/prefill';
import { valueOfferRows } from '../services/valueModule/offers';

export default function CostOfProblem() {
  const store = useDiagnosticStore();
  const [currencyChoice, setCurrencyChoice] = useState<ValueCurrency | null>(null);
  const [drafts, setDrafts] = useState<ValueDrafts>({});
  const [share, setShare] = useState<ScenarioShare>(0.5);
  const originalCurrency = answerCurrency(store.universalAnswers.u35, store.intakeAnswers.country);
  const currency = currencyChoice || originalCurrency;
  const { fields: prefilled } = valuePrefills(store, currency);
  const resolved = resolveValueFields(drafts, prefilled, currency);
  const paths = selectValuePaths(store.sectorL1, store.axisDetails);
  const pool = sectorPool(store.sectorL1);
  const result = computeCostOfProblem(resolved.inputs, paths, share);
  const identity = valueIdentity(store);
  const examples = caseStudies.filter(example => example.sector === store.sectorL1);
  const amount = (number: number | null) => number === null ? platformCopy['value.notCalculated'] : formatValueAmount(number, currency);
  const changeCurrency = (next: ValueCurrency) => {
    setCurrencyChoice(next);
    setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([field]) => !FINANCIAL_FIELDS.includes(field as ValueField))));
  };
  const field = (key: ValueField, label: string) => {
    const raw = resolved.inputs[key];
    const parsed = parseValueNumber(raw);
    const invalid = String(raw ?? '').trim() !== '' && (parsed === null || (key === 'margin' && (parsed < 1 || parsed > 100)));
    return <div className="min-w-0">
      <label htmlFor={`value-${key}`} className="block text-xs font-bold leading-5 text-[#0F172A]">
        {label}{resolved.tags[key] && <span className="mr-1 font-normal text-[#68717A]" data-testid={`value-prefilled-${key}`}>{platformCopy['value.prefilled']}</span>}
      </label>
      <input id={`value-${key}`} type="text" inputMode="numeric" autoComplete="off" aria-invalid={invalid}
        value={displayValueInput(raw)} data-testid={`value-field-${key}`} dir="rtl"
        onChange={event => { const text = event.target.value; setDrafts(previous => ({ ...previous, [key]: { text, basis: resolved.basis(key) } })); }}
        className="mt-1 block min-h-11 w-full rounded-xl border border-[#0F172A]/20 bg-white p-3 text-lg leading-8! text-[#0F172A] focus:outline-[#C9A961]" />
    </div>;
  };
  const pathResult = (index: number) => {
    const row = result.paths[index];
    return <output className={`block rounded-xl bg-[#F6F0DF] px-3 py-2 text-sm leading-6 ${row.status === 'needMargin' ? 'text-[#8A3F32]' : 'text-[#26354E]'}`}
      data-testid={`value-result-${row.path}`}>
      {row.status === 'needMargin' ? platformCopy['value.needMargin'] : row.amount === null ? platformCopy['value.notCalculated']
        : formatPlatformCopy('value.monthlyAmount', { amount: amount(row.amount) })}
    </output>;
  };

  return <details className="rounded-[1.7rem] border border-[#C9A961]/35 bg-[#FBFAF6] p-5 md:p-7" data-testid="cost-of-problem">
    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 font-bold text-[#0F172A]">
      <span className="font-display text-xl leading-7 break-words">{identity.company ? formatPlatformCopy('value.title', { company: identity.company }) : platformCopy['value.titleFallback']}</span>
      <span className="rounded-full bg-[#F6F0DF] px-3 py-1 text-xs font-bold text-[#92763D]">{platformCopy['value.badge']}</span>
    </summary>
    {identity.context && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[#68717A]" data-testid="value-context">{identity.context}</p>}
    <p className="mt-2 text-sm leading-6 text-[#68717A]">{platformCopy['value.intro']}</p>
    <div className="mt-3 grid grid-cols-2 items-end gap-3 md:grid-cols-4">
      <div className="min-w-0">
        <label htmlFor="value-currency" className="block text-xs font-bold leading-5">{platformCopy['value.currencyLabel']}</label>
        <select id="value-currency" value={currency} onChange={event => changeCurrency(event.target.value as ValueCurrency)} data-testid="value-currency"
          className="mt-1 block min-h-11 w-full rounded-xl border border-[#0F172A]/20 bg-white p-3 text-sm text-[#0F172A] focus:outline-[#C9A961]">
          {VALUE_CURRENCIES.map(code => <option key={code} value={code}>{currencyName(code)}</option>)}
        </select>
      </div>
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
    <div className="mt-3 rounded-xl bg-[#F6F0DF] p-3 text-[#26354E]" aria-live="polite" data-testid="value-totals">
      <p className="text-sm font-bold leading-6">{platformCopy['value.totalLabel']}: <output data-testid="value-total">{amount(result.total)}</output></p>
      <p className="mt-1 text-xs leading-5" data-testid="value-yearly">{result.yearly === null ? platformCopy['value.notCalculated'] : formatPlatformCopy('value.yearly', { amount: amount(result.yearly) })}</p>
      {result.capped && <p className="mt-2 text-xs leading-5 text-[#8A3F32]" data-testid="value-cap">{platformCopy['value.capNote']}</p>}
      <p className="mt-2 text-xs leading-5">{platformCopy['value.scenarioIntro']}</p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={platformCopy['value.scenarioIntro']}>
        {([['quarter', 0.25], ['half', 0.5], ['most', 0.75]] as const).map(([key, fraction]) => <button key={key} type="button"
          aria-pressed={share === fraction} onClick={() => setShare(fraction)} data-testid={`value-scenario-${key}`}
          className={`min-h-11 rounded-xl border border-[#0F172A]/20 px-2 py-2 text-sm font-bold ${share === fraction ? 'bg-[#0F172A] text-white' : 'bg-[#FBFAF6] text-[#0F172A]'}`}>
          {platformCopy[`value.scenario.${key}`]}
        </button>)}
      </div>
      <p className="mt-2 text-xs leading-5">{platformCopy['value.gainLabel']}: <output className="font-bold" data-testid="value-gain">{amount(result.scenarioGain)}</output></p>
    </div>
    <p className="mt-3 text-sm font-bold leading-6">{platformCopy['value.offersIntro']}</p>
    <div className="mt-2 space-y-2 text-xs leading-5 text-[#26354E]" data-testid="value-offers">
      {valueOfferRows(result.total, currency).map(row => <p key={row.key} data-testid={`value-offer-${row.key}`}>{row.text}</p>)}
    </div>
    <p className="mt-2 text-xs leading-5 text-[#68717A]" data-testid="value-fx-note">{formatPlatformCopy('value.fxNote', {
      rate: formatValueNumber(FX_RATES_PER_USD[currency], 4), currency: currencyName(currency), date: indianDigits(FX_AS_OF)
    })}</p>
    {examples.map((example, index) => <div key={index} className="mt-3 rounded-xl bg-[#F6F0DF] p-3 text-sm leading-6" data-testid="value-case-study">
      <p className="font-bold">{platformCopy['value.caseTitle']}</p><p>{example.beforeAfter}</p>
      <p>{formatPlatformCopy('value.caseMonths', { months: formatValueNumber(example.months) })}</p><p>{example.note}</p>
    </div>)}
    <p className="mt-2 text-xs leading-5 text-[#68717A]">{platformCopy['value.disclaimer']}</p>
  </details>;
}
