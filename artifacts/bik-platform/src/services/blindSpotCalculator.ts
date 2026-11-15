/**
 * Blind-spot loss computation: every sector deep-tier formula runs on the client's own
 * declared figures only. A blind spot enters the report when (a) the sector's deep
 * questions were answered, (b) every required deep field is a positive finite number,
 * and (c) the computed monthly amount is positive. Nothing is invented, and the sum
 * feeds the decision balance only as a derived-from-declared reading.
 */
import { BLIND_SPOT_FORMULAS } from '../data/sectorFinancialTaxonomy';

export interface SectorBlindSpot {
  id: string;
  name: string;
  monthlyAmount: number;
}

export interface SectorBlindSpotsResult {
  spots: SectorBlindSpot[];
  /** مجموع الخسائر الشهرية المشتقة من أرقام العميل المصرَّح بها (0 حين لا شيء يُحسب). */
  monthlyTotal: number;
}

function finitePositive(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function computeSectorBlindSpots(sectorL1: string | undefined | null, answers: Record<string, any>): SectorBlindSpotsResult {
  const formulas = BLIND_SPOT_FORMULAS[sectorL1 || ''] ?? BLIND_SPOT_FORMULAS.universal ?? [];
  const spots: SectorBlindSpot[] = [];
  for (const formula of formulas) {
    const deepReady = formula.requiredDeepFields.every(field => finitePositive(answers[field]));
    if (!deepReady) continue;
    let amount = 0;
    try {
      amount = Math.round(formula.compute(answers, answers));
    } catch {
      amount = 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) continue;
    spots.push({ id: formula.id, name: formula.name, monthlyAmount: amount });
  }
  const monthlyTotal = spots.reduce((sum, spot) => sum + spot.monthlyAmount, 0);
  return { spots, monthlyTotal };
}
