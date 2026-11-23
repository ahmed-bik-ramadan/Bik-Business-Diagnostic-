import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { SlimPathway } from '../src/pathways/engine';

const libraryFile = new URL('../../../docs/codex/bik-library-v2.json', import.meta.url);
const overridesFile = new URL('../../../docs/codex/release-overrides.json', import.meta.url);
const slimFile = new URL('../src/pathways/pathways.slim.json', import.meta.url);

export function generateSlimPathways(): string {
  const { pathways } = JSON.parse(readFileSync(libraryFile, 'utf8')) as {
    pathways: (SlimPathway & { release_group: number; scope_flag?: string | null })[];
  };
  const overrides = JSON.parse(readFileSync(overridesFile, 'utf8')) as Record<string, {
    release_group: number;
    scope_flag?: string | null;
  }>;
  const slim = pathways
    .filter(pathway => {
      const override = overrides[pathway.id];
      const group = override?.release_group ?? pathway.release_group;
      const scopeFlag = override?.scope_flag === undefined ? pathway.scope_flag : override.scope_flag;
      return group === 1 && !scopeFlag;
    })
    .map(({ id, axis, title, service_name, dialects, platform_copy }) => ({
      id, axis, title, service_name, dialects,
      platform_copy: Object.fromEntries(Object.entries(platform_copy)
        .map(([key, { headline, meaning, action }]) => [key, { headline, meaning, action }])),
    }));
  return JSON.stringify(slim, null, 2) + '\n';
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  writeFileSync(slimFile, generateSlimPathways());
}
