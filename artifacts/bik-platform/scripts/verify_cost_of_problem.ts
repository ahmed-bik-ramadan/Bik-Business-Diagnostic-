import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {computeCostOfProblem,parseValueNumber,VALUE_ESTIMATE_LABEL,type ValueField,type ValueInputs} from '../src/services/valueModule/compute';
import {SECTOR_POOLS,sectorPool,selectValuePaths} from '../src/services/valueModule/sectorPools';
import {answerCurrency,currencyName,displayValueInput,formatValueAmount,formatValueNumber,fxFreshness,VALUE_CURRENCIES} from '../src/services/valueModule/currency';
import {valuePrefills,valueIdentity,VALUE_FIELDS} from '../src/services/valueModule/prefill';
import {VALUE_OFFERS,valueOfferRows} from '../src/services/valueModule/offers';
import {platformCopy,formatPlatformCopy} from '../src/copy/platformCopy';
import {FX_AS_OF,FX_RATES_PER_USD,BIK_OFFERS,EXECUTIVE_PROJECT_USD,MONTHLY_RETAINER_USD,FOCUSED_WEEK_USD} from '../src/config/appConfig';
import {DEEP_TIER_QUESTIONS} from '../src/data/sectorFinancialTaxonomy';
import {sectors} from '../src/data/sectors';
import {universalQuestions} from '../src/data/universalQuestions';
import {caseStudies} from '../src/data/caseStudies';
import {buildChatContext} from '../src/services/chatPolicy';

let passed=0;
const check=(value:unknown,message:string)=>{assert.ok(value,message);passed++;console.log('PASS: '+message);};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const clinical={unitNet:30,margin:70,lostUnits:40,dormantCount:600,returnsPerYear:2,monthlyUnits:300,underPct:10};
const calculated=computeCostOfProblem(clinical,['L','R','P']);
assert.deepEqual(calculated.paths.map(r=>r.amount),[840,2100,900]);
check(calculated.total === 3000 && calculated.yearly === 36000 && calculated.overlapExcluded === 'L',
  'the clinic shows all three values and counts only the larger of lost units and dormant customers');
assert.deepEqual(Object.keys(calculated).sort(),
  ['capped', 'inconsistentSales', 'noRevenue', 'overlapExcluded', 'paths', 'rawTotal', 'total', 'yearly']);
const largerLost = computeCostOfProblem({...clinical, lostUnits: 200}, ['R','L','P']);
check(largerLost.overlapExcluded === 'R' && largerLost.total === 5100, 'larger lost-unit effect wins in either order');
for (const paths of [['L','R'], ['R','L']] as const) {
  const tie = computeCostOfProblem({...clinical, lostUnits: 100}, paths);
  check(tie.total === 2100 && tie.overlapExcluded === 'R', 'tied paths count once with a stable excluded row');
}
const single = computeCostOfProblem(clinical, ['L','L']);
check(single.paths.length === 1 && single.total === 840 && single.overlapExcluded === null, 'lost units count once');
check(computeCostOfProblem({...clinical,margin:1},['P']).total===900,'price gap is full price contribution and never multiplied by margin');
check(computeCostOfProblem({...clinical,monthlyWaste:115},['L','R','W']).total===2215,'declared waste adds once to the larger overlapping effect');
check(computeCostOfProblem({...clinical,monthlyWaste:5000},['L','R','P']).total===3000,'a hidden waste path cannot enter the total');
check(computeCostOfProblem({},['L','R','P']).total===null,'empty inputs are uncalculated, never invented zero amounts');
for (const margin of ['', -1, 101, NaN, Infinity]) {
  const result = computeCostOfProblem({...clinical, margin}, ['L','R','P']);
  check(result.paths.slice(0, 2).every(row => row.status === 'needMargin' && row.amount === null) &&
    result.total === 900 && result.overlapExcluded === null, `invalid or missing margin excludes only L and R: ${margin}`);
}
for (const margin of [0, 0.5, 100]) {
  const result = computeCostOfProblem({...clinical, margin}, ['L','R']);
  assert.deepEqual(result.paths.map(row => row.amount), [12 * margin, 30 * margin]);
  check(result.total === 30 * margin && result.paths.every(row => row.status === 'calculated'), `valid margin: ${margin}`);
}
for (const [field, expected] of Object.entries({unitNet: null, lostUnits: 3000, dormantCount: 1740,
  returnsPerYear: 1740, monthlyUnits: 2100, underPct: 2100})) {
  const result = computeCostOfProblem({...clinical, [field]: ''}, ['L','R','P']);
  check(result.paths.some(row => row.status === 'missing') && result.total === expected, `${field}: only complete paths count`);
}
const capped = computeCostOfProblem({...clinical, monthlyRevenue: 2500}, ['L','R','P']);
check(capped.rawTotal === 3000 && capped.total === 2500 && capped.capped && capped.yearly === 30000,
  'positive revenue caps the guarded sum before annualization');
for (const monthlyRevenue of [0, '٠٫٠', '0.00']) {
  for (const paths of [['L','R','P'], ['W']] as const) {
    const result = computeCostOfProblem({...clinical, monthlyWaste: 120, monthlyRevenue}, paths);
    check(result.noRevenue && result.rawTotal === null && result.total === null && result.yearly === null &&
      result.paths.every(row => row.amount === null) && !result.capped && result.overlapExcluded === null,
      'declared zero suppresses all monetary estimates');
  }
}
for (const monthlyRevenue of ['', null, undefined]) {
  const result = computeCostOfProblem({...clinical, monthlyRevenue}, ['L','R','P']);
  check(!result.noRevenue && !result.capped && result.total === 3000 && !result.inconsistentSales,
    'absent revenue leaves the total uncapped');
}
for (const [monthlyRevenue, expected] of [[4499, true], [4500, false], [4501, false]] as const) {
  const result = computeCostOfProblem({...clinical, monthlyRevenue}, ['P']);
  check(result.inconsistentSales === expected && result.total === 900, 'warning uses a strict two-times boundary without blocking');
}
for (const field of ['monthlyUnits','unitNet'] as const) {
  check(!computeCostOfProblem({...clinical, monthlyRevenue: 1, [field]: ''}, ['L']).inconsistentSales,
    'missing factors cannot trigger a sales warning');
}
const unsupported = {discountSavings: 700, stockReleased: 800, receivablesCollected: 900,
  ownerHoursSaved: 100, ownerHourlyRate: 300, weeklyHoursAvailable: 40};
for (const paths of [['L','R','P'], ['L','R','W']] as const) {
  const inputs = {...clinical, monthlyWaste: 115};
  assert.deepEqual(computeCostOfProblem({...inputs, ...unsupported}, paths), computeCostOfProblem(inputs, paths));
  check(computeCostOfProblem({...unsupported, monthlyRevenue: ''}, paths).total === null,
    'discount, stock, receivables and owner time cannot create a monetary result on their own');
}
const zeros=computeCostOfProblem({unitNet:0,margin:70,lostUnits:0,dormantCount:0,returnsPerYear:0,monthlyUnits:0,underPct:0},['L','R','P']);
check(zeros.total===0&&!zeros.capped&&zeros.paths.every(r=>r.status==='calculated'),'explicit zero inputs produce calculated zeros');
const large=computeCostOfProblem({unitNet:999999999999,margin:100,lostUnits:999999999999,dormantCount:999999999999,returnsPerYear:12,monthlyUnits:999999999999,underPct:100},['L','R','P']);
check(large.total!==null&&Number.isFinite(large.total)&&large.total>1e24,'twelve-digit values remain finite without an arbitrary sector cap');
for (const underPct of [0, 12.5, 100, 150]) {
  check(computeCostOfProblem({...clinical, underPct}, ['P']).total === 90 * Math.min(underPct, 100),
    `price gap is capped at the full value of units sold: ${underPct}`);
}
const frozen=Object.freeze({...clinical});assert.deepEqual(computeCostOfProblem(frozen,['L','R','P']),calculated);
check(JSON.stringify(frozen)===JSON.stringify(clinical),'the calculator is deterministic and never mutates its input');
check(JSON.stringify(computeCostOfProblem({...clinical,axisScore:0} as ValueInputs,['L','R','P']))
  ===JSON.stringify(computeCostOfProblem({...clinical,axisScore:100} as ValueInputs,['L','R','P'])),
  'diagnostic scores cannot affect any cost amount');
for(const raw of ['',null,undefined,'unknown','NaN','Infinity','-١٢','abc','1e6',NaN,Infinity,-1])check(parseValueNumber(raw)===null,`reject missing/malformed/negative input: ${String(raw)}`);
check(parseValueNumber('١٢٬٣٤٥٫٧٥')===12345.75&&parseValueNumber('۱۲،۳۴۵')===12345&&parseValueNumber('0')===0,'Arabic/Persian digits, grouping, decimals and zero parse without assumptions');
check(displayValueInput('١٢٣٤٫')==='1,234.'&&displayValueInput('1234.50')==='1,234.50','numeric fields retain a decimal point and precision while displaying Latin digits');

assert.deepEqual(Object.keys(SECTOR_POOLS).sort(),Object.keys(DEEP_TIER_QUESTIONS).sort());
check(true,'all nine actual deep-sector IDs are covered and no guessed deep-sector ID is added');
const general=sectors.filter(s=>!SECTOR_POOLS[s.id]);check(general.length===11,'the remaining eleven real sectors use the general pool');
const sameStatuses={'الفريق والعمليات':{status:'يحتاج تحسين',score:1},'الموقع التنافسي':{status:'مستقر',score:99}};
check(JSON.stringify(selectValuePaths('healthcare',sameStatuses))===JSON.stringify(selectValuePaths('healthcare',{
  'الفريق والعمليات':{status:'يحتاج تحسين',score:99},'الموقع التنافسي':{status:'مستقر',score:1}} as typeof sameStatuses)),
  'the existing statuses alone choose P/W; score magnitudes add no multiplier or leakage assumption');
for(const sector of sectors){
 for(const key of ['unit','lost','dormant','monthlyUnits','priceGap','waste'] as const)assert.ok(platformCopy[sectorPool(sector.id)[key]]);
 const stable={'الفريق والعمليات':{status:'مستقر'},'الموقع التنافسي':{status:'مستقر'}};
 assert.deepEqual(selectValuePaths(sector.id,stable),['L','R','P']);
 const weak={...stable,'الفريق والعمليات':{status:'يحتاج تحسين'}};
 assert.deepEqual(selectValuePaths(sector.id,weak),['L','R',sector.id==='realestate'?'P':'W']);
 assert.deepEqual(selectValuePaths(sector.id,{...weak,'الموقع التنافسي':{status:'نقطة حرجة'}}),['L','R','P']);
 assert.deepEqual(selectValuePaths(sector.id,null),['L','R','P']);
 check(true,`${sector.id}: complete wording and deterministic P/W rules, always retaining L and R`);
}
assert.deepEqual(VALUE_CURRENCIES,[...universalQuestions.find(q=>q.id==='u35')!.options!.map(o=>o.value)]);
check(true,'the currency selector offers exactly the six real u35 currencies in the same order');
for(const currency of VALUE_CURRENCIES)check(answerCurrency(currency,'مصر')===currency,`${currency}: u35 overrides country`);
for(const [country,currency]of [['مصر','EGP'],['السعودية','SAR'],['الإمارات','AED'],['الكويت','KWD'],['قطر','QAR'],['البحرين','USD'],['أخرى','USD']])
 check(answerCurrency(undefined,country)===currency,`${country}: literal CompanyIntake country maps to ${currency}`);
check(answerCurrency('unknown',undefined)==='USD'&&answerCurrency('', 'الإمارات العربية المتحدة')==='USD','an absent/unsupported currency and an unmatched country name use USD without guessing');
assert.deepEqual(FX_RATES_PER_USD,{USD:1,SAR:3.75,AED:3.6725,QAR:3.64,KWD:.307,EGP:53});
check(FX_AS_OF==='2026-11-14','all six FX rates and the dated owner-supplied reference are exact');
check(FOCUSED_WEEK_USD*FX_RATES_PER_USD.EGP===14416&&formatValueAmount(14416,'EGP')==='14,416 جنيهاً','272 USD converts to exactly 14416 EGP, displayed with Latin digits and en-US grouping');
assert.deepEqual(VALUE_OFFERS.map(o=>[o.name,o.price]),[[BIK_OFFERS.executiveProject.name,EXECUTIVE_PROJECT_USD],[BIK_OFFERS.monthlyRetainer.name,MONTHLY_RETAINER_USD],[BIK_OFFERS.focusedWeek.name,FOCUSED_WEEK_USD]]);
check(true,'all three offer names, prices and ordering derive from unchanged appConfig offers');
check(valueOfferRows(100000,'EGP')[2].text.includes('$272 (نحو 14,416 جنيهاً)'),'the offer row contains the actual dollar price and selected-currency equivalent');
check(valueOfferRows(100000,'EGP')[2].pct===14.416,'offer percentages compare local price with local monthly cost');
check(valueOfferRows(0,'SAR').every(r=>r.pct===null&&!r.text.includes('NaN')&&r.text.includes('أكبر')),'zero cost has no division by zero and uses the above-cost wording');
check(valueOfferRows(null,'SAR').every(r=>r.text.includes('أدخل أرقام')),'pending totals still show exactly three meaningful offer lines');
check(valueOfferRows(100000,'USD').at(-1)!.text.includes('$272.') && !valueOfferRows(100000,'USD').at(-1)!.text.includes('دولاراً'), 'USD rows use a dollar sign with no suffix or trailing space');
check(valueOfferRows(1000,'USD',[{key:'changed',name:'عرض اختباري',price:100}])[0].pct===10,'changing an injected source price changes the result without price literals in the component');
check(fxFreshness(FX_AS_OF,new Date('2026-12-29T23:59:00Z')).stale===false&&fxFreshness(FX_AS_OF,new Date('2026-12-30T00:00:00Z')).stale===true,'FX age crosses the acceptance boundary only after forty-five full days');
for(const report of [false,true]){
 const child=spawnSync(process.execPath,['--import','tsx',path.join(root,'scripts/check_value_fx.ts'),'--as-of','2026-01-01','--now','2026-11-14',...(report?['--report']:[])],{cwd:root,encoding:'utf8'});
 check(child.status===(report?0:1)&&(child.stdout+child.stderr).includes('FX DATE CHECK FAILED')&&(!report||(child.stdout+child.stderr).includes('WARNING')),
  report?'an outdated FX check prints a clear build warning without failing the package':'the independent strict FX freshness check fails when the rates are old');
}

const store={userName:'أحمد رمضان علي',companyName:'شركة الوصل للتجارة',sectorL1:'healthcare',sectorL2:'عيادة عامة',intakeAnswers:{country:'مصر',city:'القاهرة'},universalAnswers:{u34:45,u31:100000,u35:'EGP'},sectorAnswers:{hd01:30,hd02:300},axisDetails:{'الفريق والعمليات':{status:'مستقر'},'الموقع التنافسي':{status:'مستقر'}}};
assert.deepEqual(valueIdentity(store),{company:store.companyName,context:'أحمد رمضان علي، شركة الوصل للتجارة، عيادة عامة، القاهرة، مصر'});
check(true,'complete identity preserves the stored name, company, subsector, city and country without editing');
check(valueIdentity({...store,userName:'',sectorL2:'',intakeAnswers:{}}).context==='شركة الوصل للتجارة، healthcare','missing identity elements remove their separators and sector falls back to the stored sectorL1 verbatim');
check(valueIdentity({}).company===''&&valueIdentity({}).context==='','absent identity has no undefined or empty separators');
const initial=valuePrefills(store,'EGP');
check(initial.fields.unitNet?.value===30&&initial.fields.unitNet.source==='hd01'&&initial.fields.monthlyRevenue?.source==='u31','the explicit visit value overrides generic AOV while declared monthly revenue is read directly');
check(valuePrefills({...store,sectorL1:'retail',sectorAnswers:{rd03:40}},'EGP').fields.unitNet?.source==='rd03','retail average invoice is an exact unit-value match');
check(valuePrefills({...store,sectorL1:'realestate',sectorAnswers:{red02:5000}},'EGP').fields.unitNet?.source==='red02','property unit value means the declared commission, never the property price');
check(!valuePrefills({...store,sectorL1:'realestate',sectorAnswers:{}},'EGP').fields.unitNet,'an ambiguous generic property transaction value does not replace missing commission');
check(valuePrefills({...store,sectorL1:'construction',sectorAnswers:{cod01:500000}},'EGP').fields.unitNet?.source==='cod01','declared average single-project value maps directly to that sector unit');
check(valuePrefills({...store,sectorL1:'education',universalAnswers:{...store.universalAnswers,ud01:90000}},'EGP').fields.monthlyRevenue?.source==='ud01','general-sector declared monthly revenue reads ud01 from the actual universalAnswers persistence path');
check(valuePrefills({...store,sectorL1:'professional',sectorAnswers:{prd01:80000}},'EGP').fields.monthlyRevenue?.source==='prd01','professional monthly revenue has the explicit prd01 source');
check(Object.keys(valuePrefills(store,'SAR').fields).length===0,'financial prefills are unavailable in a different currency');
for(const field of ['margin','lostUnits','dormantCount','returnsPerYear','monthlyUnits','underPct','monthlyWaste'] as const)
 check(initial.fields[field]===undefined,`${field}: no equivalent question is guessed or derived`);
check(Object.keys(valuePrefills({...store,universalAnswers:{},sectorAnswers:{ad03:70,ted01:50000,hd02:300,cod02:4}},'EGP').fields).length===0,
 'hourly cost, recurring-only revenue, booked appointments and active project counts are not silently relabelled');

for (const [sectorL1, inventoryId] of [['retail','rd01'], ['import','imd01']]) {
  const prefills = valuePrefills({sectorL1, universalAnswers: {u17: '20_40'}, sectorAnswers: {[inventoryId]: 100000}}, 'USD');
  assert.deepEqual(prefills.fields, {}, 'declared inventory or owner time does not prefill any cost path');
}

const newCopy=Object.entries(platformCopy).filter(([key])=>key.startsWith('value.'));
for(const [key,value]of newCopy){assert.ok(value.trim(),key);assert.doesNotMatch(value,/ROI|عائد|يغطي|لا يغطي|ضمان|سنحقق|ستربح|نسبة تسرب/iu,key);assert.doesNotMatch(value,/[٠-٩۰-۹]|\p{Extended_Pictographic}/u,key);}
check(newCopy.length===101,'all 101 functional value strings are centralized, nonempty, without forbidden words, Arabic-Indic digits or emoji; there are no exceptions');
check(platformCopy['value.disclaimer']==='تقدير حسابي من أرقامك أنت، وليس تدقيقاً ولا وعداً بنتيجة. لا يُحفظ ما كتبت.'&&platformCopy['value.sector.automotive.waste']==='إعادة عمل والتزامات إصلاح شهرياً','the two owner clarifications are exact');
check(!Object.keys(platformCopy).some(k=>k.startsWith('roi.')),'all retired copy keys are removed');
check(caseStudies.length===0,'the published case-study array is empty and invents no cases');

// Execute the real component and its event handlers, replacing only React scheduling and external sinks.
const compiled=await build({entryPoints:[path.join(root,'src/components/CostOfProblem.tsx')],bundle:true,write:false,platform:'node',format:'cjs',
 external:['react','react/jsx-runtime','../store/diagnosticStore','../data/caseStudies'],logLevel:'silent'});
type Element={type:any;props:Record<string,any>};
function mount(initial:any,cases:any[]=[]){
 let current=structuredClone(initial),cursor=0;const hooks:any[]=[];
 const create=(type:any,props:any,...children:any[])=>({type,props:{...props,children}});
 const react={Fragment:'fragment',createElement:create,useState:(init:any)=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof init==='function'?init():init;
  return [hooks[index],(next:any)=>{hooks[index]=typeof next==='function'?next(hooks[index]):next;}];}};
 const module={exports:{} as any};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:(name:string)=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {Fragment:'fragment',jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})};
  if(name==='../store/diagnosticStore')return {useDiagnosticStore:()=>current};
  if(name==='../data/caseStudies')return {caseStudies:cases};
  throw new Error('Unexpected dependency: '+name);
 }});
 return {render:()=>{cursor=0;return module.exports.default() as Element;},setStore:(next:any)=>{current=next;},store:()=>current};
}
function nodes(root:any):Element[]{return Array.isArray(root)?root.flatMap(nodes):root&&typeof root==='object'&&root.props?[root,...nodes(root.props.children)]:[];}
function text(root:any):string{return Array.isArray(root)?root.map(text).join(''):typeof root==='string'||typeof root==='number'?String(root):root?.props?text(root.props.children):'';}
const find=(tree:Element,id:string)=>{const node=nodes(tree).find(n=>n.props['data-testid']===id);assert.ok(node,id);return node;};
const descriptors=['localStorage','sessionStorage'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
const originalFetch=globalThis.fetch;let writes=0,requests=0;
globalThis.fetch=(async()=>{requests++;throw new Error('Cost input must remain local');}) as typeof fetch;
for(const [name]of descriptors)Object.defineProperty(globalThis,name,{configurable:true,value:{getItem:()=>null,setItem:()=>{writes++;},removeItem:()=>{writes++;},clear:()=>{writes++;}}});
try{
 const app=mount(store),before=JSON.stringify(app.store());let tree=app.render();
 check(tree.type==='details'&&!tree.props.open&&tree.props.className==='rounded-[1.7rem] border border-[#C9A961]/35 bg-[#FBFAF6] p-5 md:p-7','the real component is closed details in the exact former container');
 check(text(tree).includes('كلفة مشكلة شركة الوصل للتجارة')&&text(find(tree,'value-context'))===valueIdentity(store).context,'the real title and context render the full stored identity');
 const edit=(key:ValueField,value:string)=>{find(tree,'value-field-'+key).props.onChange({target:{value}});tree=app.render();};
 for(const [key,value]of Object.entries(clinical))edit(key as ValueField,String(value));
 const estimate = (formatted: string) => `${formatted} (${VALUE_ESTIMATE_LABEL})`;
 assert.equal(VALUE_ESTIMATE_LABEL, 'تقدير استرشادي');
 check(text(find(tree,'value-total')) === estimate('3,000 جنيهاً'), 'input handlers render the guarded monthly total');
 for (const [id, formatted] of Object.entries({'value-result-L':'840 جنيهاً', 'value-result-R':'2,100 جنيهاً',
   'value-result-P':'900 جنيهاً', 'value-yearly':'36,000 جنيهاً'})) {
   check(text(find(tree, id)).includes(estimate(formatted)), `${id}: the amount carries the common estimate label`);
 }
 check(text(find(tree,'value-offer-focusedWeek')).includes(estimate('$272') + ' (نحو 14,416 جنيهاً)') &&
   text(find(tree,'value-fx-note')).includes(VALUE_ESTIMATE_LABEL), 'the comparison labels the price pair and exchange rate');
 const excludedRow = nodes(tree).find(node => node.type === 'div' && node.props.children?.[0]?.props?.['data-testid'] === 'value-result-L');
 check(text(excludedRow).includes('لا يُجمع الأثران لأنهما يتقاطعان'), 'the overlap explanation appears under the excluded amount');
 check(!nodes(tree).some(node => node.type === 'button' || node.props['data-testid'] === 'value-gain'),
   'the calculator renders neither preset recovery buttons nor a gain');
 edit('margin','0');
 check(find(tree,'value-field-margin').props['aria-invalid'] === false && text(find(tree,'value-total')) === estimate('900 جنيهاً'),
   'zero margin is accepted by both UI and calculator');
 edit('margin','70');
 edit('monthlyRevenue','4499');
 check(text(tree).includes('الأرقام المدخلة لا تتسق؛ راجعها') && text(find(tree,'value-total')) === estimate('3,000 جنيهاً'),
   'the exact warning appears alongside a usable result');
 edit('monthlyRevenue','4500');
 check(!text(tree).includes('الأرقام المدخلة لا تتسق؛ راجعها'), 'the warning clears at the boundary');
 edit('monthlyRevenue','0');
 check(text(tree).includes('لم يُدخل إيراد، فنعرض الأولويات دون تقدير مالي') &&
   !nodes(tree).some(node => node.type === 'output' || ['value-totals','value-offers','value-fx-note'].includes(node.props['data-testid'])),
   'zero revenue shows the priorities notice without path amounts, totals, fees or FX');
 edit('monthlyRevenue','');
 check(!text(tree).includes('لم يُدخل إيراد') && text(find(tree,'value-total')) === estimate('3,000 جنيهاً'),
   'clearing the zero restores estimates immediately');
 edit('monthlyRevenue','100000');
 app.setStore({...store,sectorAnswers:{...store.sectorAnswers,hd01:40}});tree=app.render();
 check(find(tree,'value-field-unitNet').props.value==='40'&&text(find(tree,'value-total'))===estimate('4,000 جنيهاً'),'changing the source answer then rendering updates the input and result, including a formerly edited prefill');
 check(Boolean(find(tree,'value-prefilled-unitNet')),'a newly read source answer carries its prefill marker');
 edit('unitNet','50');check(text(find(tree,'value-total'))===estimate('5,000 جنيهاً')&&app.store().sectorAnswers.hd01===40,'local editing changes the result without changing the store answer');
 const preCurrency=JSON.stringify(app.store());find(tree,'value-currency').props.onChange({target:{value:'SAR'}});tree=app.render();
 check(find(tree,'value-field-unitNet').props.value===''&&find(tree,'value-field-monthlyRevenue').props.value===''&&find(tree,'value-field-lostUnits').props.value==='40','changing currency clears financial fields and preserves counts without conversion');
 edit('unitNet','20');edit('monthlyRevenue','100000');
 check(text(find(tree,'value-total'))===estimate('2,000 ريالاً'),'new-currency inputs use their declared values without converting visitor numbers');
 find(tree,'value-currency').props.onChange({target:{value:'EGP'}});tree=app.render();
 check(find(tree,'value-field-unitNet').props.value==='40'&&find(tree,'value-field-monthlyRevenue').props.value==='100,000','returning to the answer currency refills current answers rather than restoring another-currency drafts');
 check(JSON.stringify(app.store())===preCurrency,'all currency operations leave the store unchanged');
 app.setStore({...store,axisDetails:{'الفريق والعمليات':{status:'نقطة حرجة'},'الموقع التنافسي':{status:'مستقر'}}});tree=app.render();edit('monthlyWaste','8172639');
 check(Boolean(find(tree,'value-field-monthlyWaste'))&&!nodes(tree).some(n=>n.props['data-testid']==='value-field-underPct'),'the actual component replaces P with W without showing four paths');
 check(writes===0&&requests===0,'typing every applicable field and changing currency writes no browser storage and makes no requests');
 const context=JSON.stringify(buildChatContext({sector:'healthcare',axisDetails:store.axisDetails} as any));
 check(!context.includes('8172639')&&!/unitNet|monthlyWaste|dormantCount|returnsPerYear|underPct/.test(context),'local cost inputs never enter the existing chat context');
 assert.equal(before,JSON.stringify(store));check(true,'initial accepted answers remain byte-identical');
 const empty=mount({intakeAnswers:{},universalAnswers:{},sectorAnswers:{},axisDetails:{},sectorL1:'education'}).render();
 check(text(empty).includes('كلفة مشكلة شركتك')&&!/undefined|NaN|Infinity|[٠-٩۰-۹]/.test(text(empty)),'a fully missing identity and empty figures still render meaningful Arabic text');
 check(!nodes(empty).some(n=>n.props['data-testid']==='value-case-study'),'no case-study card appears today');
 const sample={sector:'healthcare',beforeAfter:'وصف اختباري اصطناعي فقط',months:2,note:'لا يمثل حالة منشورة'};
 check(nodes(mount(store,[sample]).render()).filter(n=>n.props['data-testid']==='value-case-study').length===1
  &&!nodes(mount({...store,sectorL1:'education'},[sample]).render()).some(n=>n.props['data-testid']==='value-case-study'),'only a matching supplied case renders, with no fabricated default');
 for(const p of nodes(tree).filter(n=>['p','output','label','option','button'].includes(n.type)))assert.ok(text(p).trim(),p.type);
 check(!/undefined|NaN|Infinity|[٠-٩۰-۹]/.test(text(tree)),'filled output text has no empty templates, Arabic-Indic numerals or non-finite values');
}finally{globalThis.fetch=originalFetch;for(const [name,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete (globalThis as any)[name];}}
const source=fs.readFileSync(path.join(root,'src/components/CostOfProblem.tsx'),'utf8');
check(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|setField|setState)\b/.test(source),'component source has no storage, network or store-write sinks');
check(!/slider|type="range"|gradient|shadow-|lucide|<svg|<img/.test(source),'the module introduces no sliders, gradients, shadows, icons or images');
check(!source.includes('272')&&!source.includes('499')&&!source.includes('5000'),'the component contains no repeated source offer price literals');
const report=fs.readFileSync(path.join(root,'src/pages/Report.tsx'),'utf8');
check(report.indexOf('<CostOfProblem />')>report.indexOf('<OfferCards ')&&report.indexOf('<CostOfProblem />')<report.indexOf('data-testid="consultant-cta"'),'the unit occupies the exact slot after OfferCards and before the existing consultant block');
for(const name of ['src/components/RoiCalculator.tsx','src/services/roiBreakeven.ts','scripts/verify_roi_calculator.ts'])assert.equal(fs.existsSync(path.join(root,name)),false);
check(true,'the retired component, calculation service and calculator-specific test are removed');
console.log(`COST OF PROBLEM: ${passed} PASSED, 0 FAILED`);
