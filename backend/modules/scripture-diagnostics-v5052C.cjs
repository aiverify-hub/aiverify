'use strict';
// Private, bounded lifecycle evidence. Never stores prompts, provider text or credentials.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function create(directory,{maxBytes=524288,maxQueued=128}={}){
 const file=path.join(directory,'scripture-operations.jsonl'),previous=file+'.previous';
 const operations=new WeakMap(),transports=new WeakMap();
 let queue=Promise.resolve(),pending=0,written=0,dropped=0,failures=0,lastFailure=null;
 const token=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(x)?x:null;
 function emit(op,event,fields={}){
  try{
   const row={schema:1,at:new Date().toISOString(),event,operationId:op?.id||null,role:op?.role||null,requestId:op?.request?.id||null};
   for(const k of ['scanEventId','externalRequestId','transportId','cacheDisposition','stage','reason','timeoutType','validationStatus','decisionStatus','providerStatus','incompleteReason','deliveryStatus'])if(token(fields[k]))row[k]=fields[k];
   for(const k of ['startedAt','deadlineAt','completedAt','transportStartedAt'])if(Number.isFinite(fields[k]))row[k]=fields[k];
   for(const k of ['deadlineMs','socketTimeoutMs','httpStatus','outputCharacters','elapsedMs'])if(Number.isFinite(fields[k]))row[k]=fields[k];
   for(const k of ['late','aborted','recorded','refusal'])if(typeof fields[k]==='boolean')row[k]=fields[k];
   if(Array.isArray(fields.validationCodes))row.validationCodes=fields.validationCodes.slice(0,12).map(token).filter(Boolean);
   if(pending>=maxQueued){dropped++;return;}
   const line=JSON.stringify(row)+'\n';pending++;
   queue=queue.then(async()=>{
    await fs.promises.mkdir(directory,{recursive:true});
    let size=0;try{size=(await fs.promises.stat(file)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(size+Buffer.byteLength(line)>maxBytes){await fs.promises.rm(previous,{force:true});await fs.promises.rename(file,previous);}
    await fs.promises.appendFile(file,line,{mode:0o600});written++;
   }).catch(e=>{failures++;lastFailure=token(e.code)||'WRITE_FAILURE';}).finally(()=>pending--);
  }catch{failures++;lastFailure='CAPTURE_FAILURE';}
 }
 function request(externalRequestId){return {id:crypto.randomUUID(),externalRequestId:token(externalRequestId),operations:[]};}
 function start(req,d,{role='independent_scripture',deadlineMs=3000,socketTimeoutMs=2800}={}){
  req=req||request();const now=Date.now(),op={id:crypto.randomUUID(),role,request:req,started:now,returned:false};
  if(req.operations.length<16)req.operations.push(op);else dropped++;
  operations.set(d,op);emit(op,'start',{startedAt:now,deadlineAt:now+deadlineMs,deadlineMs,socketTimeoutMs,externalRequestId:req.externalRequestId});return op;
 }
 function transport(d,key,disposition){
  let t=key&&transports.get(key);if(!t){t={id:crypto.randomUUID(),startedAt:Date.now()};if(key)transports.set(key,t);}
  const op=operations.get(d);if(op)emit(op,'transport_join',{transportId:t.id,transportStartedAt:t.startedAt,cacheDisposition:disposition});return t;
 }
 function bind(key,t){if(key&&t)transports.set(key,t);}
 function parsed(op,d,audit,{late=false,aborted=false}={}){
  op.completionCaptured=true;
  emit(op,late?'late_completion':'completion',{completedAt:Date.now(),elapsedMs:Date.now()-op.started,late,aborted,stage:d.stage,reason:d.reason,
   timeoutType:d.reason==='request_timeout'?'socket_inactivity':undefined,cacheDisposition:d.cacheDisposition,httpStatus:d.httpStatus,
   providerStatus:d.providerStatus,incompleteReason:d.incompleteReason,outputCharacters:d.outputCharacters,refusal:d.refusal,
   validationStatus:audit?(audit.decision?'accepted':'rejected'):'not_run',decisionStatus:audit?.decision?.status,validationCodes:audit?.errors?.map(e=>e.code)});
 }
 function delivered(op,status,aborted=false){op.returned=true;emit(op,'selection_return',{deliveryStatus:status,aborted,timeoutType:status==='deadline'?'selection_wall_clock':undefined,elapsedMs:Date.now()-op.started});}
 function recorded(req,event){if(!req)return;req.finalized=true;const stub={request:req,role:'scan_link'};emit(stub,'scan_recorded',{scanEventId:event?.eventId,recorded:!!event,externalRequestId:req.externalRequestId});}
 function finalCache(req){const op=start(req,{}, {role:'final_answer_cache',deadlineMs:0,socketTimeoutMs:0});emit(op,'cache_reuse',{cacheDisposition:'final-answer-cache',validationStatus:'not_rerun'});delivered(op,'cached');}
 return {request,start,transport,bind,parsed,delivered,recorded,finalCache,emit,flush:()=>queue,health:()=>({version:1,private:true,maxBytesPerFile:maxBytes,files:2,maxQueued,pending,written,dropped,failures,lastFailure,retention:'size_bounded_oldest_rotation_not_scan_history'})};
}
module.exports={create};
