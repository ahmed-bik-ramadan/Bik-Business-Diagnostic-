import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {reviewCopy, dialectForCountry} from '../src/services/dialect';
import {buildReviewPages, buildReviewDestination, selectReviewMirrorAxis} from '../src/services/reviewContent';
import {computeDeterministicScore, DIAGNOSTIC_DIMENSIONS, POSITIVE_SIGNALS, NEGATIVE_SIGNALS} from '../src/services/deterministicScoring';
import {buildReviewedSections, confirmReview} from '../src/services/reviewState';
import {buildChatContext} from '../src/services/chatPolicy';
import {generateDiagnosticReport} from '../src/services/diagnose';
import {reviewSessions} from './fixtures/reviewSessions';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const approved=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/fixtures/reviewRound2ApprovedCopy.json'),'utf8'));
const copy=reviewCopy('fusha'),axes=Object.keys(DIAGNOSTIC_DIMENSIONS);
let passed=0;
const check=(condition:unknown,message:string)=>{assert.ok(condition,message);passed++;console.log('PASS: '+message);};
const actual:Record<string,string>={};
function flatten(value:unknown,key:string){
  if(typeof value==='string')actual[key]=value;
  else if(Array.isArray(value))value.forEach((item,index)=>flatten(item,key+'.'+(index+1)));
  else if(value&&typeof value==='object')for(const [name,item]of Object.entries(value))flatten(item,key+'.'+name);
}
flatten(copy.mirror,'review.mirror');flatten(copy.destination,'review.destination');
assert.deepEqual(Object.keys(actual).sort(),Object.keys(approved.copy).sort());
check(Object.keys(actual).length===49,'49 new approved keys are present without missing or extra templates');
for(const [key,value]of Object.entries(actual)){
  check(value===approved.copy[key],`${key}: exact PAGE12_FINAL text after edge trimming only`);
  assert.equal(value,value.trim());
  assert.doesNotMatch(value,/[0-9٠-٩۰-۹A-Za-z]|\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u20E3/u);
  const prose=key==='review.mirror.close.1'?value.replace('ونحن معك',''):value;
  const tokens=prose.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g,'').match(/\p{L}+/gu)||[];
  assert.ok(!tokens.some(word=>/^(?:و|ف)?(?:أنا|نحن|لدي|عندي|لنا|شركتي|إجابتي|لدينا|عندنا|شركتنا)$/u.test(word)),key);
  if(key.startsWith('review.mirror.open.'))assert.ok(value.length>=40&&value.length<=110);
  if(key.startsWith('review.mirror.close.'))assert.ok(value.length>=40&&value.length<=120);
}
check(copy.mirror.close[0].includes('ونحن معك'),'the sole permitted first-person phrase is preserved in close.1');
for(const country of ['مصر','السعودية','الإمارات','الكويت','المغرب']){
  const localized=reviewCopy(dialectForCountry(country));
  assert.deepEqual(localized.mirror,copy.mirror);assert.deepEqual(localized.destination,copy.destination);
}
check(true,'new editorial copy follows the shared fusha path for all existing dialect selections');

const sessions=reviewSessions();
for(const reference of approved.v16Reference){
  const session=sessions.find(item=>item.sessionId===reference.sessionId)!;
  const pages=buildReviewPages(session);
  for(let index=0;index<3;index++)for(const key of ['title','subtitle','lines','sources'] as const)
    assert.deepEqual(pages[index][key],reference.pages[index][key],`${session.sessionId}: unchanged v16 ${key} on page ${index+1}`);
}
check(true,'all v16 titles, symptoms, selected destinations, consequences and source ordering remain unchanged in the five reference sessions');

function healthy(){
  const session=structuredClone(sessions[0]);session.sectorAnswers={};
  for(const [id,value]of Object.entries(POSITIVE_SIGNALS))session.universalAnswers![id]=Array.isArray(value)?value[0]:80;
  session.universalAnswers!.u30='unknown';return session;
}
function noGoal(session=healthy()){
  session.universalAnswers!.u25='unknown';session.universalAnswers!.u30='unknown';return session;
}
const axisSessions=axes.map(axis=>{
  const session=healthy();
  for(const id of DIAGNOSTIC_DIMENSIONS[axis]){
    const negative=NEGATIVE_SIGNALS[id];if(negative)session.universalAnswers![id]=Array.isArray(negative)?negative[0]:10;
  }
  return {axis,session};
});
for(const {axis,session}of axisSessions){
  const score=computeDeterministicScore(session.universalAnswers!,session.intakeAnswers);
  assert.equal(selectReviewMirrorAxis(score.axisDetails),axis);
  const page=buildReviewPages(session)[0];
  check(Boolean(page.sources.length)&&copy.mirror.open[axis].includes(page.mirror!.opening),`${axis}: calculated prominence selects this axis's approved opening`);
}
const tied=Object.fromEntries([...axes].reverse().map(axis=>[axis,{status:'نقطة حرجة',score:20}]));
check(selectReviewMirrorAxis(tied)===axes[0],'fixed six-axis order resolves equal status and score despite reversed object insertion order');
check(selectReviewMirrorAxis({...tied,[axes[4]]:{status:'نقطة حرجة',score:5}})===axes[4],'lower score resolves equal critical status');
const priority=Object.fromEntries(axes.map(axis=>[axis,{status:'يحتاج تحسين',score:1}]));
check(selectReviewMirrorAxis({...priority,[axes[3]]:{status:'نقطة حرجة',score:99}})===axes[3],'critical status outranks an improvement axis even with a higher score');
check(selectReviewMirrorAxis({...tied,'الرعاية الصحية':{status:'نقطة حرجة',score:-1}})===axes[0],'sector names cannot enter the six-axis selection');
check(selectReviewMirrorAxis({[axes[0]]:{status:'بيانات غير كافية',score:0},[axes[2]]:{status:'مستقر',score:80}})===axes[2],
  'an insufficient-data placeholder is not treated as a computed zero score');

const financial=noGoal(structuredClone(sessions[0]));
const snapshot=JSON.stringify(financial),first=buildReviewPages(financial);
for(let repeat=0;repeat<10;repeat++)assert.deepEqual(buildReviewPages(structuredClone(financial)),first);
check(JSON.stringify(financial)===snapshot,'repeat generation is deterministic and never mutates session input');
for(const [id,expectedClose]of [['A',2],['B',0],['C',1]] as const){
  const pages=buildReviewPages({...financial,sessionId:id});
  assert.equal(pages[0].mirror!.closing,copy.mirror.close[expectedClose]);
  const lead=copy.destination.lead.findIndex(text=>pages[1].lines[0].startsWith(text));
  const tail=copy.destination.tail.findIndex(text=>pages[1].lines[0].endsWith(text));
  check(lead>=0&&tail>=0&&lead!==tail,`${id}: stable session variants select different lead and tail indexes`);
}

const destination=copy.destination;
const one=buildReviewDestination([{source:'u01'}],axes[0],'A')!;
const two=buildReviewDestination([{source:'u01'},{source:'u04'}],axes[0],'A')!;
const three=buildReviewDestination([{source:'u01'},{source:'u04'},{source:'u10'}],axes[0],'A')!;
check(one===`${destination.lead[1]} ${destination.u01}. ${destination.tail[0]}`,'one symptom composes the exact lead, destination, period and different-index tail');
check(two===`${destination.lead[1]} ${destination.u01}، وأن ${destination.u04.slice(3)}. ${destination.tail[0]}`,'two symptoms use the approved Arabic conjunction without repeated أن');
check(three===`${destination.lead[1]} ${destination.u01}، وأن ${destination.u04.slice(3)}، وأن ${destination.u10.slice(3)}. ${destination.tail[0]}`,'three symptoms preserve displayed order and conjunctions');
check(buildReviewDestination([{source:'u01'},{source:'u04'},{source:'u10'},{source:'u12'}],axes[0],'A')===three,'at most three displayed symptoms enter the proposed destination');
const sector=buildReviewDestination([{source:'h01'}],axes[3],'A')!;
check(sector===`${destination.lead[1]} ${destination.axis[axes[3]]}. ${destination.tail[0]}`,'a sector symptom uses the chosen general-axis destination without a sector mapping');
check(buildReviewDestination([{source:'u13'}],axes[3],'A')===sector,'an ID outside the approved 24 destinations uses the same chosen-axis fallback');
check(buildReviewDestination([{source:'h01'},{source:'h03'},{source:'p03'}],axes[3],'A')===sector,'identical axis destination lines are included once');
check(buildReviewDestination([],axes[0],'A')===undefined,'no symptoms generate no inferred destination');
assert.throws(()=>buildReviewDestination([{source:'h01'}],'unapproved-axis','A'));
check(true,'missing approved templates fail explicitly instead of fabricating prose');

const healthcare=noGoal(healthy());healthcare.sectorL1='healthcare';healthcare.sectorAnswers={h01:35,h03:'automatic'};
const healthcarePages=buildReviewPages(healthcare),healthAxis=selectReviewMirrorAxis(computeDeterministicScore(healthcare.universalAnswers!,healthcare.intakeAnswers).axisDetails);
check(healthcarePages[0].sources.includes('h01')&&!healthcarePages[0].sources.some(id=>DIAGNOSTIC_DIMENSIONS[healthAxis].includes(id))
  &&copy.mirror.open[healthAxis].includes(healthcarePages[0].mirror!.opening),'a sector-only displayed symptom still gets the opening from the independently calculated general axis');
check(healthcarePages[1].lines[0].includes(destination.axis[healthAxis]),'the actual healthcare page uses that general axis in its destination');
const noSymptoms=buildReviewPages(noGoal());
check(noSymptoms[0].lines[0]===copy.noPain&&!noSymptoms[0].mirror&&noSymptoms[1].lines[0]===copy.fallback[2]
  &&!noSymptoms[1].inferredDestination,'noPain keeps the old fallback and has no opening or closing');
check(!buildReviewPages(sessions[2])[0].mirror,'a completely missing-data page also has no mirror paragraphs');
for(const custom of [
  {...financial,review:{...financial.review!,responses:{2:{kind:'custom' as const,text:'أريد أن يتضح طريق العمل لفريقي.'}}}},
  {...financial,review:{...financial.review!,drafts:{2:'هذه وجهتي بكلماتي.'}}}
]){
  const page=buildReviewPages(custom)[1];assert.equal(page.lines[0],copy.fallback[2]);assert.ok(!page.inferredDestination);
}
check(true,'saved or drafted custom destinations keep their existing page-2 path');
const selected=structuredClone(financial);selected.universalAnswers!.u25='specific_number';
check(buildReviewPages(selected)[1].lines[0]===copy.goals.specific_number&&!buildReviewPages(selected)[1].inferredDestination,'an explicitly selected goal is unchanged');
const reflected=structuredClone(financial);reflected.universalAnswers!.u30='profitability_time';
check(buildReviewPages(reflected)[1].lines[0]===copy.reflection.profitability_time&&!buildReviewPages(reflected)[1].inferredDestination,'an existing reflective destination is unchanged');

const words=(text:string)=>new Set(text.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').match(/[\p{L}\p{N}]+/gu)||[]);
const similarity=(a:string,b:string)=>{const l=words(a),r=words(b);return [...l].filter(word=>r.has(word)).length/new Set([...l,...r]).size;};
const page1Catalog=[...Object.values(copy.pain).flat(),...Object.values(copy.axisPain).flat(),...Object.values(copy.sectorPain).flat(),copy.noPain,copy.fallback[1],
  ...Object.values(copy.mirror.open).flat(),...copy.mirror.close];
let within=0,across=0;
for(let i=0;i<page1Catalog.length;i++)for(let j=i+1;j<page1Catalog.length;j++){
  const value=similarity(page1Catalog[i],page1Catalog[j]);within=Math.max(within,value);assert.ok(value<.65);
}
check(page1Catalog.length===79,'all 79 approved old and new page-1 templates, including the data-gap fallback, have pairwise Jaccard < 0.65');
const destinationClauses=Object.entries(copy.destination)
  .filter(([key,value])=>/^u\d{2}$/.test(key)&&typeof value==='string').map(([,value])=>value as string)
  .concat(Object.values(copy.destination.axis));
const interventions=Object.entries(copy.solution).map(([id,solution])=>`${copy.problemHook[id]||copy.problemHook.other} ${solution}`)
  .concat(Object.values(copy.axisSolution).map(solution=>`${copy.problemHook.other} ${solution}`),`${copy.problemHook.h01} ${copy.sectorSolution}`);
const page2Catalog=[...Object.values(copy.goals),...Object.values(copy.reflection),copy.fallback[2],...interventions,
  ...destinationClauses,...copy.destination.lead,...copy.destination.tail];
for(const a of page1Catalog)for(const b of page2Catalog){const value=similarity(a,b);across=Math.max(across,value);assert.ok(value<.65,`${a} / ${b}`);}
check(page2Catalog.length===74,'all 5846 old/new page-1 versus page-2 template pairs remain below Jaccard 0.65');
for(const session of [...sessions,financial,healthcare,...axisSessions.map(item=>noGoal(structuredClone(item.session)))]){
  const pages=buildReviewPages(session);
  const p1=[...(pages[0].mirror?[pages[0].mirror.opening,pages[0].mirror.closing]:[]),...pages[0].lines];
  const p2=[...pages[1].lines,...(pages[1].inferredDestination?[pages[1].lines.join(' ')]:[])];
  for(const a of p1)for(const b of p2){const value=similarity(a,b);across=Math.max(across,value);assert.ok(value<.65,`${a} / ${b}`);}
  for(const text of [...p1,...p2])assert.doesNotMatch(text,/أن\s+أن|،\s*،|\.\.| {2}/u);
}
check(true,'page-1 framing and symptoms remain distinct from all tested page-2 lines and complete composed paragraphs');
for(const text of [one,two,three,sector])assert.doesNotMatch(text,/أن\s+أن|،\s*،|\.\.| {2}/u);
check(true,'all one/two/three-symptom and fallback compositions have clean punctuation and spacing');
console.log(`REVIEW ROUND2 SIMILARITY: page1=${within.toFixed(3)}; page1/page2=${across.toFixed(3)}; reject>=0.65`);

// Run the actual page component and its yes handler, with routing/store sinks only replaced.
type Element={type:any;props:Record<string,any>};
const compiled=await build({entryPoints:[path.join(ROOT,'src/pages/ReviewPage.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',
  external:['react','react-router-dom','lucide-react','../store/diagnosticStore'],logLevel:'silent'});
function renderPage(input:any,page:number){
  const state=structuredClone(input),writes:Array<{key:string;value:any}>=[],navigations:any[]=[];
  state.setField=(key:string,value:any)=>{writes.push({key,value});state[key]=value;};
  const react={Fragment:'fragment',createElement:(type:any,props:any,...children:any[])=>({type,props:{...props,children}}),
    useMemo:(fn:()=>any)=>fn(),useEffect:()=>{},useLayoutEffect:()=>{},useRef:(current:any)=>({current})};
  const module={exports:{} as any};
  runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:(name:string)=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {Fragment:'fragment',jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})};
    if(name==='react-router-dom')return {useNavigate:()=>(...args:any[])=>navigations.push(args),useParams:()=>({page:String(page)})};
    if(name==='lucide-react')return {ArrowRight:'arrow'};
    if(name==='../store/diagnosticStore')return {useDiagnosticStore:()=>state};
    throw new Error('Unexpected component dependency: '+name);
  }});
  return {tree:module.exports.default() as Element,state,writes,navigations};
}
function nodes(root:any):Element[]{if(Array.isArray(root))return root.flatMap(nodes);if(!root||typeof root!=='object'||!root.props)return [];
  return [root,...nodes(root.props.children)];}
function text(root:any):string{if(Array.isArray(root))return root.map(text).join('');if(typeof root==='string'||typeof root==='number')return String(root);return root?.props?text(root.props.children):'';}
const find=(tree:Element,id:string)=>nodes(tree).filter(node=>node.props['data-testid']===id);
const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{throw new Error('New review rendering attempted network access');}) as typeof fetch;
try{
  const page1=renderPage(financial,1),p1=first[0];
  assert.equal(find(page1.tree,'review-mirror-open').length,1);assert.equal(find(page1.tree,'review-mirror-close').length,1);
  const displayed=nodes(find(page1.tree,'review-box')[0]).filter(node=>node.type==='p');
  assert.deepEqual(displayed.map(text),[p1.mirror!.opening,...p1.lines,p1.mirror!.closing]);
  check(find(page1.tree,'review-mirror-open')[0].props.className.includes('font-normal')
    &&find(page1.tree,'review-statement')[0].props.className.includes('font-medium'),'mirror paragraphs are separate, lighter than symptoms, and surround the unchanged statements');
  find(page1.tree,'review-yes')[0].props.onClick();
  assert.equal(page1.state.review.responses[1].text,p1.lines.join('\n'));
  check(!page1.state.review.responses[1].text.includes(p1.mirror!.opening)&&!page1.state.review.responses[1].text.includes(p1.mirror!.closing),'yes stores only the original page-1 symptom lines');
  assert.deepEqual(page1.writes.map(item=>item.key),['review','report','proposal']);
  assert.deepEqual(Object.keys(page1.state.review).sort(),Object.keys(financial.review!).sort());
  check(true,'the page-1 handler adds no store fields or storage keys');
  const page2Input=structuredClone(financial);page2Input.review=confirmReview(page2Input.review!,1,{kind:'accepted',text:p1.lines.join('\n')});
  const page2=renderPage(page2Input,2),p2=buildReviewPages(page2Input)[1];
  assert.equal(find(page2.tree,'review-statement').length,1);
  assert.equal(text(find(page2.tree,'review-statement')[0]),p2.lines.join(' '));
  find(page2.tree,'review-yes')[0].props.onClick();
  check(page2.state.review.responses[2].text===p2.lines.join('\n')&&p2.inferredDestination,'page 2 renders the complete composition and saves it through the existing newline-separated acceptance path');
  assert.deepEqual(Object.keys(page2.state.review).sort(),Object.keys(financial.review!).sort());
  assert.deepEqual(Object.keys(page2.state.review.responses[2]).sort(),['kind','text']);
  const sections=buildReviewedSections(page2.state.review);
  assert.equal(sections[0].text,p1.lines.join('\n'));assert.equal(sections[1].text,p2.lines.join('\n'));
  check(true,'existing reviewed sections keep page-1 symptoms alone and page-2 inferred prose plus the exact approved intervention');
  const report=await generateDiagnosticReport({...financial,review:page2.state.review} as any);
  assert.equal(report.review![1].text,p2.lines.join('\n'));
  const context=JSON.stringify(buildChatContext({...financial,sector:financial.sectorL1} as any));
  assert.ok(!context.includes('review'));
  for(const value of Object.values(actual))assert.ok(!context.includes(value));
  check(true,'the existing report path accepts page-2 prose locally while chat context contains none of the new templates');
  const customInput=structuredClone(page2Input);customInput.review!.responses[2]={kind:'custom',text:'وجهتي أكتبها بكلماتي.'};
  const custom=renderPage(customInput,2);
  check(text(find(custom.tree,'review-box')[0])==='وجهتي أكتبها بكلماتي.','the actual page preserves custom visitor prose without inferred additions');
}finally{globalThis.fetch=originalFetch;}
console.log(`REVIEW ROUND2: ${passed} PASSED, 0 FAILED`);
