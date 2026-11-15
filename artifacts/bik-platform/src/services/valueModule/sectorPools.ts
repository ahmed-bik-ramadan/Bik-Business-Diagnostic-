import type { PlatformCopyKey } from '../../copy/platformCopy';
import type { ValuePath } from './compute';

export interface SectorPool {
  unit: PlatformCopyKey;
  lost: PlatformCopyKey;
  dormant: PlatformCopyKey;
  monthlyUnits: PlatformCopyKey;
  priceGap: PlatformCopyKey;
  waste: PlatformCopyKey;
  allowsWaste: boolean;
}
const pool = (sector: string, allowsWaste = true): SectorPool => ({
  unit: `value.sector.${sector}.unit` as PlatformCopyKey,
  lost: `value.sector.${sector}.lost` as PlatformCopyKey,
  dormant: `value.sector.${sector}.dormant` as PlatformCopyKey,
  monthlyUnits: `value.sector.${sector}.monthlyUnits` as PlatformCopyKey,
  priceGap: `value.sector.${sector}.priceGap` as PlatformCopyKey,
  waste: `value.sector.${allowsWaste ? sector : 'general'}.waste` as PlatformCopyKey,
  allowsWaste
});
/** IDs verified against DEEP_TIER_QUESTIONS and sectors.ts; no sector wording in the component. */
export const SECTOR_POOLS: Readonly<Record<string, SectorPool>> = {
  healthcare: pool('healthcare'), retail: pool('retail'), fnb: pool('fnb'), automotive: pool('automotive'),
  realestate: pool('realestate', false), professional: pool('professional'), import: pool('import'),
  tech: pool('tech'), construction: pool('construction')
};
export const GENERAL_POOL = pool('general');
export const sectorPool = (sector: string): SectorPool => SECTOR_POOLS[sector] || GENERAL_POOL;
export function selectValuePaths(sector: string, axes: Record<string, { status?: string }> | null | undefined): readonly ValuePath[] {
  const waste = axes?.['الفريق والعمليات']?.status !== 'مستقر' && axes?.['الموقع التنافسي']?.status === 'مستقر';
  return ['L', 'R', waste && sectorPool(sector).allowsWaste ? 'W' : 'P'];
}
