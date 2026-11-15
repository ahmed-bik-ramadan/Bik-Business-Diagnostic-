import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ReportPreview } from '../src/components/report/ReportPreview';
import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { createFallbackReport } from '../src/services/reportFallback';

const report = createFallbackReport({ scoreResult: computeDeterministicScore({ u31: 1000, u06: -8, u35: 'EGP' }, {}), companyData: { companyName: 'SYNTHETIC PREVIEW' } });
const html = renderToStaticMarkup(<MemoryRouter><ReportPreview
  clientReport={report.dual_layer!.clientReport} fullReportText="PRIVATE_QA_SENTINEL_ONLY_FOR_DELIVERY"
  parts={[{ label: 'فتح الجزء 1 من 1', url: 'https://wa.me/201066966515?text=test' }]}
  openedParts={[]} deliveryConfirmed={false} copied={false} copyError={false} notice=""
  onOpenPart={() => {}} onCopy={() => {}} onConfirm={() => {}}
/></MemoryRouter>);
assert.equal((html.match(/data-testid="preview-/g) || []).length, 5, 'Preview has the five agreed modules');
assert.equal(html.includes('PRIVATE_QA_SENTINEL_ONLY_FOR_DELIVERY'), false, 'Full dossier is not in the default visible preview');
assert.equal(html.includes('ملف تسليم المستشار'), false, 'No public consultant-dossier tab');
assert.ok(html.includes('فتح الرابط لا يثبت إرسال الرسالة أو وصولها'), 'Delivery is not claimed');
console.log('PREVIEW MARKUP: 4 PASSED, 0 FAILED; static render only, not a browser/phone test.');
