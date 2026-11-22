import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

type Node = { type: string; props: Record<string, any>; children: unknown[] };
type Cleanup = () => void;
type Effect = () => Cleanup | undefined;
const source = readFileSync('src/pages/Processing.tsx', 'utf8');
const compiled = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'transform' }).code;
const stages = ['قراءة إجاباتك', 'حساب المحاور الستة', 'ربط الأعراض بالأولويات', 'تجهيز المعاينة'];
const report = { health_score: 40 };
const drain = async () => { await Promise.resolve(); await Promise.resolve(); };

const nodes = (node: any): Node[] => Array.isArray(node) ? node.flatMap(nodes)
  : node && typeof node === 'object' && node.props ? [node, ...node.children.flatMap(nodes)] : [];

function mount(generate: () => Promise<unknown>, redirect: string | null = null) {
  let state: any;
  let stageEffect: { run: Effect; deps: unknown[] } | undefined;
  let lastDependencies: unknown[] | undefined;
  let cleanup: Cleanup | undefined;
  const routes: string[] = [];
  const assigned: Record<string, unknown> = {};
  const navigate = (path: string) => routes.push(path);
  const react = {
    createElement: (type: string, props: object | null, ...children: unknown[]): Node => ({ type, props: props || {}, children }),
    useState: (initial: object) => {
      state ??= initial;
      return [state, (next: any) => { state = typeof next === 'function' ? next(state) : next; }];
    },
    useEffect: (run: Effect, deps: unknown[]) => { stageEffect = { run, deps }; }
  };
  const dependencies: Record<string, unknown> = {
    react,
    'react-router-dom': { useNavigate: () => navigate },
    'lucide-react': { AlertCircle: 'alert-circle', Check: 'check', RefreshCw: 'refresh' },
    '../store/diagnosticStore': { useDiagnosticStore: { getState: () => ({ setField: (key: string, value: unknown) => { assigned[key] = value; } }) } },
    '../services/diagnose': { generateDiagnosticReport: generate },
    '../services/reviewContent': { processingReviewRedirect: () => redirect },
    '../services/deterministicScoring': { computeDeterministicScore: () => ({ overall: 40 }) }
  };
  const module = { exports: {} as { default: () => Node } };
  runInNewContext(compiled, {
    module, exports: module.exports, require: (name: string) => dependencies[name],
    Error, performance: { now: () => Date.now() }, setTimeout, clearTimeout, setInterval, clearInterval
  });
  return {
    routes, assigned,
    render() {
      const tree = nodes(module.exports.default());
      if (stageEffect && !stageEffect.deps.every((dep, index) => dep === lastDependencies?.[index])) {
        cleanup?.();
        lastDependencies = stageEffect.deps;
        cleanup = stageEffect.run();
      }
      return tree;
    },
    unmount() { cleanup?.(); }
  };
}

function checkView(tree: Node[], progress: number | null, step?: number) {
  const error = tree.find(node => node.props['data-testid'] === 'processing-error');
  const bar = tree.find(node => node.props.role === 'progressbar');
  assert.equal(Boolean(error), progress === null, 'only the error state contains error markup');
  assert.equal(bar?.props['aria-valuenow'], progress ?? undefined);
  if (progress === null) {
    assert.ok(nodes(error).some(node => node.children.includes('تعذّر إكمال التحليل. حاول مرة أخرى، أو تواصل مع المستشار مباشرة.')));
    return;
  }
  const items = tree.filter(node => node.type === 'li');
  assert.deepEqual(items.map(node => node.children.at(-1)), stages);
  assert.equal(items.findIndex(node => node.props['aria-current'] === 'step'), step ?? -1);
  assert.equal(tree.filter(node => node.type === 'check').length, step ?? 4);
  assert.ok(tree.some(node => String(node.props.className).includes('motion-safe:transition-[width]')));
}

mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 0 });
try {
  const successful = mount(async () => report);
  checkView(successful.render(), 0, 0);
  await drain();
  for (let step = 1; step <= 3; step++) {
    mock.timers.tick(1500);
    checkView(successful.render(), step * 25, step);
  }
  mock.timers.tick(1499);
  checkView(successful.render(), 99, 3);
  assert.deepEqual(successful.routes, []);
  assert.equal(successful.assigned.report, undefined);
  mock.timers.tick(1);
  await drain();
  checkView(successful.render(), 100);
  assert.equal(successful.assigned.report, report);
  mock.timers.tick(200);
  assert.deepEqual(successful.routes, ['/lead-gate']);
  successful.unmount();

  let attempts = 0;
  const retry = mount(async () => {
    if (++attempts === 1) throw new Error('test failure');
    return report;
  });
  checkView(retry.render(), 0, 0);
  await drain();
  const failure = retry.render();
  checkView(failure, null);
  assert.deepEqual(retry.routes, [], 'failure shows immediately without navigating');
  failure.find(node => node.type === 'button')!.props.onClick();
  checkView(retry.render(), 0, 0);
  await drain();
  mock.timers.tick(6000);
  await drain();
  checkView(retry.render(), 100);
  retry.unmount();

  let complete!: (value: unknown) => void;
  const slow = mount(() => new Promise(resolve => { complete = resolve; }));
  checkView(slow.render(), 0, 0);
  mock.timers.tick(7000);
  checkView(slow.render(), 74, 2);
  slow.unmount();
  complete(report);
  await drain();
  assert.deepEqual(slow.assigned, {}, 'unmount cancels completion');
  assert.deepEqual(slow.routes, []);

  const direct = mount(async () => { throw new Error('unexpected analysis'); }, '/review/3');
  checkView(direct.render(), 0, 0);
  assert.deepEqual(direct.routes, ['/review/3']);
  direct.unmount();
} finally {
  mock.timers.reset();
}

console.log('PROCESSING: loading, done, immediate failure, retry, six-second minimum and unmount verified');
