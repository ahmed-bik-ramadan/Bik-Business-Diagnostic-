import assert from 'node:assert/strict';
import fs from 'node:fs';

const depth = fs.readFileSync('src/pages/DiagnosticDepth.tsx', 'utf8');
assert.equal(depth.includes('الأكثر إقناعاً للعميل'), false, 'obsolete sales badge is removed');
assert.equal(depth.includes('يحسـب خسائرك الفعلية بالجنيه'), false, 'obsolete guaranteed-loss wording is absent');
assert.equal(depth.includes('يحسب خسائرك الفعلية بالجنيه'), false, 'obsolete exact-loss wording is absent');
assert.equal(depth.includes('يراجع المدخلات المالية والنطاقات المتاحة بعملتك'), true, 'financial copy is conditional');
assert.equal(depth.includes('ما تدعمه بياناتك وما يحتاج إلى تحقق مالي إضافي'), true, 'financial uncertainty is explicit');

console.log('Diagnostic depth copy contract: PASS');
