# Mobile performance

Chromium 156.0.8078.79 with Playwright at 390 × 844 CSS px, DPR 2, 4× CPU slowdown, 1.6 Mbps download, 750 kbps upload and 150 ms latency. Each measurement starts with a fresh browser context, disabled HTTP cache and a hard navigation to the production build in Vite preview.

The report fixture comes from the scripted restaurant journey. The measurement harness restores the synthetic, pre-cleanup report and genuine transfer-completion marker in each cold report context so document timings can be measured. WhatsApp was simulated locally.

Timings are medians of three runs. Served bytes count response bodies, using the gzip size whenever Vite actually served gzip. Wire bytes include response headers as recorded by Chromium. For an identity asset the gzip column is a size estimate from Node zlib and the served column is the actual transfer. Sizes use decimal KB (1 KB = 1,000 bytes).

First question means the first answer control is ready for a trial click. The script starts at the home page, chooses the restaurant sector, fills the intake and opens the questionnaire with no visitor think time. Report and consultant have no question in their cold page loads.

## PERF_BASELINE

Build source: `493a71d`.

| Route | Served bytes | Wire bytes | Requests | DOMContentLoaded | Load | LCP | First question |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 383,433 | 390,228 | 20 | 0.917 s | 0.917 s | 1.660 s | 8.640 s |
| `/report` | 392,320 | 401,375 | 26 | 0.957 s | 0.958 s | 2.876 s | — |
| `/consultant` | 607,024 | 615,943 | 26 | 0.932 s | 0.932 s | 2.808 s | — |

From the final intake click to first question ready: 0.942 s.
Largest JS chunk across the production build: `index-BawQ9DKp.js` (233,776 raw bytes, 76,142 gzip bytes).

### 15 largest responses on `/`

| Asset | Raw bytes | Gzip bytes | Served bytes | Encoding |
|---|---:|---:|---:|---|
| `assets/index-BawQ9DKp.js` | 233,776 | 76,142 | 76,142 | gzip |
| `assets/noto-naskh-arabic-arabic-700-normal-BdBAMxnO.woff2` | 53,024 | 52,847 | 53,024 | identity |
| `assets/noto-sans-arabic-arabic-900-normal-B-v2Ezdw.woff2` | 50,584 | 50,565 | 50,584 | identity |
| `assets/noto-sans-arabic-arabic-700-normal-3CqrwsiZ.woff2` | 50,228 | 50,156 | 50,228 | identity |
| `assets/noto-sans-arabic-arabic-400-normal-AAMxebZb.woff2` | 48,840 | 48,649 | 48,840 | identity |
| `assets/Faq-N0Qrt_nZ.js` | 55,989 | 18,944 | 18,944 | gzip |
| `assets/index-DKY_FVnY.css` | 104,077 | 18,256 | 18,256 | gzip |
| `assets/noto-naskh-arabic-latin-700-normal-CG_vrPqD.woff2` | 12,048 | 12,071 | 12,048 | identity |
| `assets/diagnosticStore-CYbLtQGG.js` | 36,853 | 12,032 | 12,032 | gzip |
| `assets/noto-sans-arabic-latin-400-normal-CjsIS08k.woff2` | 10,748 | 10,771 | 10,748 | identity |
| `assets/noto-sans-arabic-latin-900-normal-op-BRWmy.woff2` | 10,636 | 10,659 | 10,636 | identity |
| `assets/noto-sans-arabic-latin-700-normal-D41hNJFR.woff2` | 10,620 | 10,643 | 10,620 | identity |
| `assets/platformCopy-DMqJXGP5.js` | 17,639 | 3,825 | 3,825 | gzip |
| `assets/Welcome-xyshIxh6.js` | 10,384 | 3,701 | 3,701 | gzip |
| `assets/reportTransferState-BKrYu34k.js` | 4,772 | 1,968 | 1,968 | gzip |

### 15 largest responses on `/report`

| Asset | Raw bytes | Gzip bytes | Served bytes | Encoding |
|---|---:|---:|---:|---|
| `assets/index-BawQ9DKp.js` | 233,776 | 76,142 | 76,142 | gzip |
| `assets/noto-naskh-arabic-arabic-700-normal-BdBAMxnO.woff2` | 53,024 | 52,847 | 53,024 | identity |
| `assets/noto-sans-arabic-arabic-700-normal-3CqrwsiZ.woff2` | 50,228 | 50,156 | 50,228 | identity |
| `assets/noto-sans-arabic-arabic-400-normal-AAMxebZb.woff2` | 48,840 | 48,649 | 48,840 | identity |
| `assets/pathways.slim-BUJEQ-UE.js` | 243,402 | 34,996 | 34,996 | gzip |
| `assets/Faq-N0Qrt_nZ.js` | 55,989 | 18,944 | 18,944 | gzip |
| `assets/index-DKY_FVnY.css` | 104,077 | 18,256 | 18,256 | gzip |
| `assets/engine-B_RM2UYQ.js` | 36,525 | 13,313 | 13,313 | gzip |
| `assets/noto-naskh-arabic-latin-700-normal-CG_vrPqD.woff2` | 12,048 | 12,071 | 12,048 | identity |
| `assets/diagnosticStore-CYbLtQGG.js` | 36,853 | 12,032 | 12,032 | gzip |
| `assets/noto-sans-arabic-latin-400-normal-CjsIS08k.woff2` | 10,748 | 10,771 | 10,748 | identity |
| `assets/Report-1YuW5PKN.js` | 33,197 | 10,653 | 10,653 | gzip |
| `assets/noto-sans-arabic-latin-700-normal-D41hNJFR.woff2` | 10,620 | 10,643 | 10,620 | identity |
| `assets/deterministicScoring-Bv1zeUP-.js` | 15,806 | 6,079 | 6,079 | gzip |
| `assets/platformCopy-DMqJXGP5.js` | 17,639 | 3,825 | 3,825 | gzip |

### 15 largest responses on `/consultant`

| Asset | Raw bytes | Gzip bytes | Served bytes | Encoding |
|---|---:|---:|---:|---|
| `assets/index-BawQ9DKp.js` | 233,776 | 76,142 | 76,142 | gzip |
| `assets/noto-sans-arabic-arabic-800-normal-BqK5sGSM.woff2` | 53,820 | 53,673 | 53,820 | identity |
| `assets/noto-sans-arabic-arabic-600-normal-JPxwL-XU.woff2` | 53,260 | 52,974 | 53,260 | identity |
| `assets/noto-naskh-arabic-arabic-700-normal-BdBAMxnO.woff2` | 53,024 | 52,847 | 53,024 | identity |
| `assets/noto-sans-arabic-arabic-900-normal-B-v2Ezdw.woff2` | 50,584 | 50,565 | 50,584 | identity |
| `assets/noto-sans-arabic-arabic-700-normal-3CqrwsiZ.woff2` | 50,228 | 50,156 | 50,228 | identity |
| `assets/noto-sans-arabic-arabic-400-normal-AAMxebZb.woff2` | 48,840 | 48,649 | 48,840 | identity |
| `assets/Consultant-lwmFu0YP.js` | 123,238 | 44,247 | 44,247 | gzip |
| `assets/pathways.slim-BUJEQ-UE.js` | 243,402 | 34,996 | 34,996 | gzip |
| `assets/Faq-N0Qrt_nZ.js` | 55,989 | 18,944 | 18,944 | gzip |
| `assets/index-DKY_FVnY.css` | 104,077 | 18,256 | 18,256 | gzip |
| `assets/engine-B_RM2UYQ.js` | 36,525 | 13,313 | 13,313 | gzip |
| `assets/noto-naskh-arabic-latin-700-normal-CG_vrPqD.woff2` | 12,048 | 12,071 | 12,048 | identity |
| `assets/diagnosticStore-CYbLtQGG.js` | 36,853 | 12,032 | 12,032 | gzip |
| `assets/noto-sans-arabic-latin-800-normal-D-sQJoGe.woff2` | 10,788 | 10,811 | 10,788 | identity |

### Findings

- The homepage exceeded the 350 KB limit. Its four largest font files accounted for 202,676 bytes. The fixed FAQ heading used Noto Naskh Arabic 700 and the fixed hero title used Noto Sans Arabic 900.
- The home navigation made no requests for the report, consultant, offer or pathways chunks. The Vite route split was already active.
- The only image fetched on the homepage was the existing SVG favicon. The visible header logo was text.
- The homepage LCP and largest JavaScript chunk already met the targets.
