import { EXECUTIVE_PROJECT_USD, FOCUSED_WEEK_USD, MONTHLY_RETAINER_USD } from './appConfig';
import type { OfferKey } from '../services/offerRecommendation';

export const paymentConfig = {
  "272": { url: "", depositUsd: 95.20 },
  "499": { url: "", depositUsd: 174.65 },
  "5000": null,
};

export const offerPaymentPrices = {
  focusedWeek: `${FOCUSED_WEEK_USD}`,
  monthlyRetainer: `${MONTHLY_RETAINER_USD}`,
  executiveProject: `${EXECUTIVE_PROJECT_USD}`,
} satisfies Record<OfferKey, keyof typeof paymentConfig>;

export function isPaymentOfferKey(key: string | null | undefined): key is OfferKey {
  return typeof key === 'string' && Object.hasOwn(offerPaymentPrices, key);
}
