import { FX_AS_OF } from '../src/config/appConfig';
import { fxFreshness } from '../src/services/valueModule/currency';

const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const asOf = argument('--as-of') || FX_AS_OF;
const now = argument('--now') ? new Date(argument('--now')!) : new Date();
const result = fxFreshness(asOf, now);
if (result.stale) {
  console.error(`FX DATE CHECK FAILED: FX_AS_OF=${asOf}; age=${result.ageDays} days; maximum=45 days.`);
  if (process.argv.includes('--report')) console.warn('WARNING: Owner must review indicative FX rates before publication. Build continues; this is not a package failure.');
  else process.exitCode = 1;
} else console.log(`FX DATE CHECK PASSED: FX_AS_OF=${asOf}; age=${result.ageDays} days; owner review is still required before publication.`);
