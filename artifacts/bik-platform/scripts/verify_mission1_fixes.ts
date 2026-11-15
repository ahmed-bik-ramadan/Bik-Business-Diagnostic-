/** Mission 1: retired admin handlers stay removed; mock chat never runs in production. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleChat } from '../server/chatHandler.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverSource = readFileSync(resolve(root, 'server.ts'), 'utf8');
assert.doesNotMatch(serverSource, /app\.(?:get|post|put|patch|delete|all)\(\s*['"]\/api\/v1\/admin/,
  'no retired admin endpoint remains registered');
assert.doesNotMatch(serverSource, /requireAdminAuth|import bcrypt|bik_admin_token/,
  'the admin-only middleware, import, and cookie handling are removed');
assert.match(serverSource, /app\.use\("\/api\/v1\/admin",/,
  'the catch-all admin guard is preserved');
const dbSource = readFileSync(resolve(root, 'server/db.ts'), 'utf8');
for (const name of ['getFunnelMetrics', 'findLead', 'getAllLeadsAdmin', 'getLeadDetailsById',
  'updateLeadStatusAdmin', 'saveLeadProposalAdmin', 'addLeadNoteAdmin', 'deleteLeadAdmin',
  'getAdminUserByUsername', 'createAdminSession', 'getAdminUserBySessionToken',
  'deleteAdminSession', 'logAdminAudit', 'resetLoginAttempts', 'localAdminSessions']) {
  assert.doesNotMatch(dbSource, new RegExp(`\\b${name}\\b`), `${name} has no remaining consumer and stays removed`);
}

const body = { messages: [{ role: 'user', text: 'كيف أراجع أولويات شركتي؟' }] };
const upstreamText = 'ابدأ بمراجعة أولويات شركتك مع فريقك.';
for (const nodeEnv of ['production', 'development', 'test', undefined]) {
  for (const hasKey of [false, true]) {
    let calls = 0;
    const result = await handleChat(body, {
      env: { NODE_ENV: nodeEnv, BIK_CHAT_MOCK: '1', OPENROUTER_API_KEY: hasKey ? 'synthetic-test-key' : undefined },
      fetchImpl: (async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: upstreamText } }] }), { status: 200 });
      }) as typeof fetch,
      ip: 'mission1',
      buckets: new Map()
    });
    if (nodeEnv === 'production') {
      assert.equal(result.status, hasKey ? 200 : 503);
      assert.equal(result.json.mock, undefined, 'production never returns a mock reply');
      assert.equal(calls, hasKey ? 1 : 0, 'production uses the real provider path only when a key exists');
      assert.deepEqual(result.json, hasKey ? { text: upstreamText } : { error: 'chat_unavailable' });
    } else {
      assert.equal(result.status, 200);
      assert.equal(result.json.mock, true, 'explicit mock mode still works outside production');
      assert.equal(calls, 0, 'non-production mock mode never contacts a provider');
    }
  }
}
const notOptedIn = await handleChat(body, {
  env: { NODE_ENV: 'test' },
  fetchImpl: (async () => { throw new Error('unexpected provider call'); }) as typeof fetch,
  ip: 'mission1', buckets: new Map()
});
assert.deepEqual(notOptedIn, { status: 503, json: { error: 'chat_unavailable' } });
console.log('CHAT MOCK: 9 cases passed; production ignores BIK_CHAT_MOCK, with and without a key.');

// Exercise the actual production server, including the early privacy guard and API alias.
const probe = createServer();
await new Promise<void>((done, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', done);
});
const port = (probe.address() as AddressInfo).port;
await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
const child = spawn(process.execPath, ['--import', 'tsx', resolve(root, 'server.ts')], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), BIK_CHAT_MOCK: '1', OPENROUTER_API_KEY: '' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let startupError = '';
child.stderr.on('data', chunk => { startupError = (startupError + chunk.toString()).slice(-2000); });
try {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      ready = (await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok;
      if (ready) break;
    } catch { /* The child has not started listening yet. */ }
    await new Promise(done => setTimeout(done, 50));
  }
  assert.ok(ready, `production server did not become ready: ${startupError}`);
  const paths = ['', '/', '/metrics/funnel', '/setup/status', '/setup/init', '/auth/login', '/auth/logout',
    '/me', '/leads', '/leads/synthetic', '/leads/synthetic/status', '/leads/synthetic/notes',
    '/leads/synthetic/proposal', '/unknown'];
  const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  let checked = 0;
  for (const prefix of ['/api/v1/admin', '/_bik-api/v1/admin']) {
    for (const path of paths) {
      for (const method of methods) {
        const response = await fetch(`${base}${prefix}${path}?mission=1`, { method, signal: AbortSignal.timeout(2000) });
        assert.equal(response.status, 404, `${method} ${prefix}${path} must stay disabled`);
        if (method !== 'HEAD') assert.deepEqual(await response.json(), { error: 'واجهة الإدارة غير مفعلة في وضع عدم الاحتفاظ بالبيانات.' });
        checked += 1;
      }
    }
  }
  const malformed = await fetch(`${base}/api/v1/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{', signal: AbortSignal.timeout(2000)
  });
  assert.equal(malformed.status, 404, 'admin requests are closed before request-body parsing');
  const chat = await fetch(`${base}/api/v1/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000)
  });
  assert.equal(chat.status, 503, 'the production endpoint ignores BIK_CHAT_MOCK=1 without an API key');
  assert.deepEqual(await chat.json(), { error: 'chat_unavailable' });
  console.log(`ADMIN: ${checked} route/method checks returned 404; malformed JSON also returned 404.`);
  console.log('PRODUCTION CHAT: BIK_CHAT_MOCK=1 without a key returned 503, not a synthetic reply.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, 'exit');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.kill('SIGTERM');
    try { await stopped; } finally { clearTimeout(force); }
  }
}
console.log('MISSION 1 CLEANUP: PASSED');
