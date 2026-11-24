import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('lockfile includes native bundler dependencies for all declared platforms',()=>{
 const lock=JSON.parse(readFileSync(new URL('../../../package-lock.json',import.meta.url),'utf8'));
 for(const name of ['rollup','esbuild']){
  const bundler=lock.packages[`node_modules/${name}`];
  assert.ok(bundler,`${name} must be locked`);
  for(const [dependency,version] of Object.entries(bundler.optionalDependencies)){
   const entry=lock.packages[`node_modules/${dependency}`];
   assert.ok(entry,`Missing cross-platform optional dependency: ${dependency}`);
   if(dependency.startsWith('@rollup/')||dependency.startsWith('@esbuild/')){
    assert.equal(entry.version,version,`Native dependency version mismatch: ${dependency}`);
   }
  }
 }
});
