// Explicitly user-authorized acceptance retry; preserve raw candidate before Controller validation.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { loadLivePlanningConfig } from '../../dist/src/planning/config.js';
import { FilePlanningMemoryStore } from '../../dist/src/planning/memory-store.js';
import { FileSupervisorStore } from '../../dist/src/supervisor/memory-store.js';
import { FileDevelopmentStore } from '../../dist/src/development/memory-store.js';
import { SupervisorController } from '../../dist/src/supervisor/controller.js';
import { GeminiSupervisorProposer } from '../../dist/src/supervisor/google-genai.js';
import { createVertexAiClient } from '../../dist/src/planning/google-genai.js';
assert.equal(process.argv[2], '--run-authorized-revision');
const out='docs/acceptance/todo-final-20261109';
await writeFile(out+'/retry-receipt.json',JSON.stringify({status:'started',at:new Date().toISOString()})+'\n',{flag:'wx'});
const config=await loadLivePlanningConfig('examples/supervisor-todo-gemini/config.json',process.cwd());
const memory=new FilePlanningMemoryStore(config.memory.directory);const store=new FileSupervisorStore(config.memory.directory);
const before=await store.get(config.projectId);
assert.equal(before.revision,19);assert.equal(before.phase,'tasks_proposed');
assert.deepEqual(before.taskProposal,JSON.parse(await readFile(out+'/work-orders-v1.json','utf8')));
const proposer=new GeminiSupervisorProposer(createVertexAiClient(),config.planning.writer,record=>store.appendUsage(record));
const noCall=async()=>{throw new Error('Planning/other proposal calls are out of scope for this retry');};
const controller=new SupervisorController({config,memory,store,developmentStore:new FileDevelopmentStore(config.memory.directory),
 proposer:{questions:noCall,scope:noCall,tasks:async(...args)=>{const raw=await proposer.tasks(...args);await writeFile(out+'/retry-raw-orders.json',JSON.stringify(raw,null,2)+'\n',{flag:'wx'});return raw;}},
 writer:{write:noCall},reviewer:{review:noCall}});
try{
 const result=await controller.reviseTasks(await readFile(out+'/revision-retry-request.md','utf8'));
 assert.deepEqual(result.taskProposal.source,before.taskProposal.source);
 assert.deepEqual(result.taskRevisions.at(-1).previous,before.taskProposal);
 await assert.rejects(access(config.memory.directory+'/projects/'+config.projectId+'/development/state.json'),{code:'ENOENT'});
 await writeFile(out+'/retry-receipt.json',JSON.stringify({status:'completed',at:new Date().toISOString(),revision:result.revision,orders:result.taskProposal.orders.length},null,2)+'\n');
 console.log(JSON.stringify({revision:result.revision,orders:result.taskProposal.orders.length,sourcePreserved:true,developmentInitialized:false}));
}catch{
 await writeFile(out+'/retry-receipt.json',JSON.stringify({status:'failed',at:new Date().toISOString()})+'\n');
 throw new Error('Task revision failed; inspect receipt/state before any further call.');
}
