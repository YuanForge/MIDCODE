import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./prepare-integration.mjs',import.meta.url),'utf8');
const expression=source.match(/resolve\(Promise\.resolve\(\)\.then\(\(\) => parsed\.apiKey \? midcode\.lock\(parsed\) : parsed\)\);/)[0];
function parse(raw,lock){return new Promise((resolve,reject)=>{vm.runInNewContext(`try {const parsed=JSON.parse(raw);${expression}} catch {reject(new Error('invalid JSON'));}`,{raw,resolve,reject,midcode:{lock}});});}
test('valid JSON preserves model authorization failure',async()=>{await assert.rejects(parse('{"apiKey":"midcode-1"}',()=>{throw Error('model not bound');}),/model not bound/);});
test('malformed JSON stays a parse failure',async()=>{await assert.rejects(parse('{',()=>{}),/invalid JSON/);});
test('authorized request is locked before resolving',async()=>{assert.deepEqual(await parse('{"apiKey":"midcode-1"}',()=>({locked:true})),{locked:true});});
