import { BIK_OFFERS, EXECUTIVE_PROJECT_USD, MONTHLY_RETAINER_USD, FOCUSED_WEEK_USD, FX_RATES_PER_USD, CURRENCY_LABEL } from '../../config/appConfig';
import { formatPlatformCopy } from '../../copy/platformCopy';
import { currencyUnit, formatValueNumber, type ValueCurrency } from './currency';

export const VALUE_OFFERS = [
  { key: 'executiveProject', name: BIK_OFFERS.executiveProject.name, price: EXECUTIVE_PROJECT_USD, priceLabel: BIK_OFFERS.executiveProject.price },
  { key: 'monthlyRetainer', name: BIK_OFFERS.monthlyRetainer.name, price: MONTHLY_RETAINER_USD, priceLabel: BIK_OFFERS.monthlyRetainer.price },
  { key: 'focusedWeek', name: BIK_OFFERS.focusedWeek.name, price: FOCUSED_WEEK_USD, priceLabel: BIK_OFFERS.focusedWeek.price }
] as const;
export interface ValueOffer { key: string; name: string; price: number; priceLabel?: string }
export function valueOfferRows(total: number | null, currency: ValueCurrency, offers: readonly ValueOffer[] = VALUE_OFFERS) {
  return offers.map(offer => {
    const converted = offer.price * FX_RATES_PER_USD[currency];
    const usdUnit = offer.priceLabel ? offer.priceLabel.replace(String(offer.price), '').trim() : CURRENCY_LABEL;
    const unit = currency === 'USD' ? usdUnit : formatPlatformCopy('value.convertedUnit', {
      usdUnit, amount: formatValueNumber(converted, currency === 'KWD' ? 3 : 2), currency: currencyUnit(currency)
    });
    const values = { offer: offer.name, price: formatValueNumber(offer.price), unit };
    const calculated = total !== null && Number.isFinite(total) && total >= 0;
    const above = calculated && converted > total!;
    const pct = calculated && total! > 0 ? converted / total! * 100 : null;
    const text = !calculated ? formatPlatformCopy('value.offerPending', values)
      : above || pct === null ? formatPlatformCopy('value.offerAbove', values)
      : formatPlatformCopy('value.offerRow', { ...values, pct: formatValueNumber(pct) });
    return { key: offer.key, converted, pct, text };
  });
}
