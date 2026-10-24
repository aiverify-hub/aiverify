'use strict';
// First-party event counts only. Never persist a request body, question, answer,
// credential, IP address, user agent, referrer or full URL in this store.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const kinds=['landing','open','arrival','submit','completed','failed'];
const id=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v)?v:'';
const token=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)?v:'';
function metadata(v){v=v&&typeof v==='object'?v:{};return {session:id(v.session),request:id(v.request),source:token(v.source),medium:token(v.medium),campaign:token(v.campaign)};}
function result(body,status){
 if(status>=400)return {kind:'failed',reason:'http_error'};
 const rows=String(body||'').split(/\r?\n/).filter(x=>x.startsWith('AIV_RESULT_CONTRACT:')).map(x=>{try{return JSON.parse(x.slice(x.indexOf(':')+1));}catch(_){return null;}}).filter(Boolean);
 if(!rows.length)return {kind:'failed',reason:'no_result_contract'};
 // Read only the main contract, not independent Scripture review diagnostics.
 if(rows.some(c=>c.contractValidated===false||/UNAVAILABLE|INCOMPLETE|RETRY|ERROR|INVALID|DATA_UNAVAILABLE/i.test([c.status,c.classification,c.fixedOutputBasket,c.outputBasket].join(' '))))return {kind:'failed',reason:'main_answer_unavailable'};
 if(rows.some(c=>!String(c.answer||c.directAnswer||'').trim()&&!(Array.isArray(c.answerList)&&c.answerList.some(x=>String(x||'').trim()))))return {kind:'failed',reason:'no_main_answer'};
 return {kind:'completed',reason:'answer_returned'};
}
function create({directory,internalIds=[]}){
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'traffic-events-v1.jsonl');
 const rows=[];let damaged=0; if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){if(!line)continue;try{const e=JSON.parse(line);if(e.v===1&&kinds.includes(e.kind)&&id(e.session))rows.push(e);else damaged++;}catch(_){damaged++;}}
 const markerFile=path.join(directory,'traffic-internal-sessions-v1.json');
 const markers=new Set(fs.existsSync(markerFile)?JSON.parse(fs.readFileSync(markerFile,'utf8')):[]);
 const seen=new Set(rows.map(e=>e.key)),limits=new Map(),salt=crypto.randomBytes(32),internal=new Set(internalIds),maxEvents=500000;
 function limit(peer){const key=crypto.createHmac('sha256',salt).update(String(peer||'')).digest('hex'),now=Date.now();for(const [k,v]of limits)if(v.until<now)limits.delete(k);if(!limits.has(key)){if(limits.size>=10000)return false;limits.set(key,{until:now+60000,n:0});}return ++limits.get(key).n<=120;}
 function record(kind,raw,options={}){
  const m=metadata(raw);if(!kinds.includes(kind)||!m.session)return false;
  const event=id(options.event)||crypto.randomBytes(16).toString('hex');
  const key=['submit','completed','failed'].includes(kind)?kind+':'+m.session+':'+m.request:kind+':'+event;
  if(['submit','completed','failed'].includes(kind)&&!m.request)return false;
  if(seen.has(key))return true;
  if(rows.length>=maxEvents)throw new Error('Traffic event capacity reached');
  const e={v:1,key,at:new Date().toISOString(),kind,...m,internal:!!options.internal,reason:['answer_returned','http_error','no_result_contract','main_answer_unavailable','no_main_answer','network_or_cancelled','aborted'].includes(options.reason)?options.reason:''};
  fs.appendFileSync(file,JSON.stringify(e)+'\n',{mode:0o600});seen.add(key);rows.push(e);return true;
 }
 function isInternal(tester){return !!tester&&(tester.isAdministrator===true||tester.role==='administrator'||internal.has(tester.id));}
 function summary(start,end){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||start>end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))throw new Error('Choose valid start and end dates');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const selected=rows.filter(e=>{const d=date.format(new Date(e.at));return d>=start&&d<=end;});
  const internalSessions=new Set([...markers,...rows.filter(e=>e.internal).map(e=>e.session)]);
  const counts=()=>Object.fromEntries(kinds.map(k=>[k,0]));const total=counts(),knownInternal=counts(),other=counts(),campaigns={};
  const failed=new Set(selected.filter(e=>e.kind==='failed').map(e=>e.session+':'+e.request));
  for(const e of selected){if(e.kind==='completed'&&failed.has(e.session+':'+e.request))continue;total[e.kind]++;const group=internalSessions.has(e.session)?knownInternal:other;group[e.kind]++;
   const label=[e.source||'unknown',e.medium||'unknown',e.campaign||'unknown'].join(' / ');if(!campaigns[label])campaigns[label]={other:counts(),knownInternal:counts()};campaigns[label][group===knownInternal?'knownInternal':'other'][e.kind]++;
  }
  return {ok:true,version:'TRAFFIC_V1',start,end,timeZone:'America/New_York',total,knownInternal,other,campaigns,trackingSince:rows[0]?.at||null,malformedStoredRows:damaged,notes:'Event counts, not people. Other includes unidentified internal tests. Campaign tags are supplied by links, not proof of an ad click. Completed means a main response returned, including clarification or protective refusal, not independently verified quality. Failed includes client transport/cancellation reports; independent review failure alone is not a failed answer.'};
 }
 function markInternal(session){if(!id(session))throw new Error('Invalid anonymous session ID');markers.add(session);fs.writeFileSync(markerFile,JSON.stringify([...markers]),{mode:0o600});}
 return {record,summary,limit,isInternal,metadata,result,file,markInternal};
}
module.exports={create,metadata,result};
