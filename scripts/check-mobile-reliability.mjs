import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(join(root,name),'utf8');
const index=read('index.html');
const app=read('app.js');
const sw=read('sw.js');
const variants=read('variants.js');
const media=read('media-policy.js');
const cart=read('cart-feedback.js');
const version=sw.match(/SHELL_VERSION=["']([^"']+)["']/)?.[1];

assert.ok(version,'Service Worker cache must have a version');
for (const path of ['storefront.css','media-policy.js','variants.js','app.js','search-fallback.js','cart-feedback.js']) {
  assert.ok(index.includes(path+'?v='+version),'Asset version mismatch: '+path);
}
assert.match(app,/ASSET_BASE=new URL\('\.\/',document\.baseURI\)\.href/);
assert.ok(sw.includes("new URL('assets/',SCOPE).pathname"));
assert.match(cart,/new URL\('assets\/'.*document\.baseURI/);
assert.match(media,/forma-designer-private\/main\/data\/details\//);
assert.doesNotMatch(media,/raw\.githubusercontent\.com\/gkkm8bm7rn-eng\/tetopt\/main\/data\/details\//);
assert.match(app,/list\.map\(\(product,index\)=>cardTemplate\(product,index\)\)/);
assert.match(variants,/firstScreenImage\?'eager':'lazy'/);
assert.ok(!sw.includes("'./data/catalog-index.json',"),'Catalog data should not be installed as shell assets');

const catalog=JSON.parse(read('data/catalog-index.json'));
assert.ok(catalog.products.length>500,'Catalog unexpectedly small');
for(const p of catalog.products.slice(0,12)){
  assert.ok(existsSync(join(root,'data',p.detailShard)),p.id+' detail shard missing');
  const image=p.variants[0]?.primaryImage;
  if(image?.startsWith('assets/'))assert.ok(existsSync(join(root,image)),p.id+' primary photo missing');
}
assert.equal(new URL('assets/products/1709/01.webp','https://gkkm8bm7rn-eng.github.io/forma-designer-private/').pathname,'/forma-designer-private/assets/products/1709/01.webp');
assert.equal(new URL('assets/products/1709/01.webp','https://forma.example/').pathname,'/assets/products/1709/01.webp');
console.log('PASS: version synchronization, safe paths, local photos, first-screen images and unchanged catalog structure');
