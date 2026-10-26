import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { PNG } from 'pngjs';

/* Regression for the iPhone's "DOM exists, blank pixels" bug.
 * The older scroll test measured layout and merely counted color buckets;
 * this one requires real decoded product photos to be PAINTED on screen.
 * Do not lower pixel thresholds just to make a failing screenshot pass.
 */
const browser=await webkit.launch({headless:true});
const errors=[];
try {
  for(const width of [320,375,390,430]){
    const context=await browser.newContext({
      viewport:{width,height:720},deviceScaleFactor:2,
      isMobile:true,hasTouch:true,serviceWorkers:'allow'
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(width+': '+error.message));
    await page.goto('http://127.0.0.1:8765/?tetopt_internal=on#category=12',
      {waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#productGrid .product-card').first().waitFor({timeout:45000});
    await page.waitForFunction(()=>document.querySelectorAll('#productGrid .product-card').length>=12,
      null,{timeout:30000});
    const geometry=await page.evaluate(()=>{
      const grid=document.querySelector('#productGrid'),r=grid.getBoundingClientRect();
      const containers=['.catalog-section','.catalog-layout','.catalog-content','#productGrid']
        .map(selector=>({selector,overflowX:getComputedStyle(document.querySelector(selector)).overflowX}));
      return {top:r.top+window.scrollY,height:r.height,containers};
    });
    assert.ok(geometry.height>2200,'Catalog grid must have substantial scroll depth');
    assert.ok(geometry.containers.every(item=>item.overflowX==='visible'),
      'Nested WebKit clipping is still active: '+JSON.stringify(geometry.containers));

    for(const fraction of [0,.19,.41,.64,.84]){
      const y=Math.max(0,Math.round(geometry.top+fraction*Math.max(0,geometry.height-480)));
      await page.evaluate(value=>window.scrollTo({top:value,behavior:'instant'}),y);
      await page.waitForTimeout(450);

      // If lazy images stall on a fast scroll, this MUST fail rather than
      // accepting a normal-height product card with a white image panel.
      await page.waitForFunction(()=>{
        const photos=[...document.querySelectorAll('#productGrid .product-image-stage img')];
        const visible=photos.filter(img=>{
          const r=img.getBoundingClientRect();
          return r.width>75&&r.height>75&&r.top<innerHeight-65&&r.bottom>75;
        });
        return visible.length>0&&visible.some(img=>img.complete&&img.naturalWidth>0);
      },null,{timeout:15000});

      const visible=await page.evaluate(()=>[...document.querySelectorAll('#productGrid .product-image-stage img')]
        .map(img=>{
          const r=img.getBoundingClientRect();
          return {x:r.x,y:r.y,w:r.width,h:r.height,loaded:img.complete&&img.naturalWidth>0,
            src:img.currentSrc||img.src};
        })
        .filter(r=>r.w>75&&r.h>75&&r.y<innerHeight-65&&r.y+r.h>75));
      assert.ok(visible.length>0,'No visible product image element at scroll '+y);
      const fullyVisible=visible.filter(img=>img.y>=76&&img.y+img.h<=720);
      assert.ok(fullyVisible.every(img=>img.loaded),
        'A fully visible product photo failed to load: '+JSON.stringify(fullyVisible));

      const png=PNG.sync.read(await page.screenshot({type:'png',animations:'disabled'}));
      const scale=png.width/width;
      const painted=visible.filter(v=>v.loaded).map(v=>{
        const left=Math.max(0,Math.floor((v.x+v.w*.30)*scale));
        const right=Math.min(png.width,Math.ceil((v.x+v.w*.70)*scale));
        const top=Math.max(0,Math.ceil(Math.max(76,v.y+v.h*.19)*scale));
        const bottom=Math.min(png.height,Math.floor((v.y+v.h*.80)*scale));
        let dark=0,total=0;
        for(let py=top;py<bottom;py+=7){
          for(let px=left;px<right;px+=7){
            const n=(py*png.width+px)*4;
            if(png.data[n+3]<200)continue;
            const min=Math.min(png.data[n],png.data[n+1],png.data[n+2]);
            if(min<216)dark++;
            total++;
          }
        }
        return {src:v.src,dark,total,ratio:total?dark/total:0};
      });
      const inspectable=painted.filter(v=>v.total>=45);
      assert.ok(inspectable.length>0,'No photo region to inspect at scroll '+y);
      assert.ok(inspectable.every(v=>v.dark>=10&&v.ratio>.012),
        'A neighboring product photo is blank despite decoded DOM images at scroll '+y+': '+JSON.stringify(inspectable));
      const widthState=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        offenders:[...document.querySelectorAll('body *')].map(el=>({el,r:el.getBoundingClientRect()}))
          .filter(({el,r})=>r.width>0&&r.height>0&&(r.right>innerWidth+2||r.left< -2)&&getComputedStyle(el).position!=='fixed')
          .slice(0,14).map(({el,r})=>({tag:el.tagName,cls:String(el.className).slice(0,80),
            right:Math.round(r.right),left:Math.round(r.left),width:Math.round(r.width)}))}));
      assert.ok(widthState.scrollWidth<=widthState.viewport+2,
        'Horizontal page overflow: '+JSON.stringify(widthState));
      console.log('PASS: visual image paint '+width+'px scroll '+y+' '+JSON.stringify(painted));
    }
    // Named customer-reported blank images, not just arbitrary office chairs.
    if(width===390){
      for(const term of ['Книжный шкаф Secret de Maison Росвуд','Стул барный Secret de Maison Байк']){
        await page.goto('http://127.0.0.1:8765/?tetopt_internal=on#q='+encodeURIComponent(term),
          {waitUntil:'domcontentloaded',timeout:45000});
        const photo=page.locator('#productGrid .product-card .product-image-stage img').first();
        await photo.waitFor({timeout:45000});
        await page.waitForFunction(()=>{
          const el=document.querySelector('#productGrid .product-image-stage img');
          return el?.complete&&el.naturalWidth>0;
        },null,{timeout:15000});
        await photo.scrollIntoViewIfNeeded();
        const rect=await photo.boundingBox();
        const png=PNG.sync.read(await page.screenshot({type:'png',animations:'disabled'}));
        const scale=png.width/390;
        let dark=0,total=0;
        for(let yy=Math.max(0,Math.floor((rect.y+rect.height*.20)*scale));
          yy<Math.min(png.height,(rect.y+rect.height*.78)*scale);yy+=7){
          for(let xx=Math.max(0,Math.floor((rect.x+rect.width*.28)*scale));
            xx<Math.min(png.width,(rect.x+rect.width*.72)*scale);xx+=7){
            const i=(yy*png.width+xx)*4;
            if(png.data[i+3]<200)continue;
            if(Math.min(png.data[i],png.data[i+1],png.data[i+2])<216)dark++;
            total++;
          }
        }
        assert.ok(total>50&&dark>=12,
          'Customer-reported photo is blank: '+term+' dark='+dark+' total='+total);
        console.log('PASS: reported furniture photo '+term+' dark='+dark+' total='+total);
      }
    }
    await context.close();
  }
  assert.deepEqual(errors,[],'Unexpected WebKit page exceptions');
  console.log('PASS: deep-scroll visual paint and lazy images on all iPhone widths');
} finally {await browser.close()}
