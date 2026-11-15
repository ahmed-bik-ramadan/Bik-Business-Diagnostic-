import { sectors } from '../data/sectors';
import { DIAGNOSTIC_DIMENSIONS, type AxisDetail } from './deterministicScoring';

const sectorValues = new Set(sectors.flatMap(sector => [sector.id, sector.label, ...sector.subsectors]));
const axisLabels = new Set(Object.keys(DIAGNOSTIC_DIMENSIONS));
const axisStatuses = new Set<AxisDetail['status']>(['مستقر', 'يحتاج تحسين', 'نقطة حرجة', 'بيانات غير كافية']);

/** Exact membership, before any trimming or truncation that could disguise injected syntax. */
export function safeChatSector(value: unknown): string {
  return typeof value === 'string' && sectorValues.has(value) ? value : 'غير محدد';
}

export function safeChatAxis(label: unknown, status: unknown): { label: string; status: string } | null {
  return typeof label === 'string' && axisLabels.has(label) && typeof status === 'string' && axisStatuses.has(status as AxisDetail['status'])
    ? { label, status } : null;
}
