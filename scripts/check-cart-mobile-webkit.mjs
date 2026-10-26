import assert from 'node:assert/strict';
import {webkit,devices} from 'playwright';

const browser=await webkit.launch({headless:true});
try{
  for(const width of [375,390]){
    const context=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:700},serviceWorkers:'allow'});
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',err=>pageErrors.push(err.message));
    await page.goto('http://127.0.0.1:8765/?tetopt_internal=on#category=2',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>document.querySelectorAll('#productGrid .product-card').length===19,null,{timeout:45000});

    const hint=await page.evaluate(()=>{
      const e=document.querySelector('.mobile-category-hint');
      return {text:e?.textContent.trim(),arrowBackground:e?getComputedStyle(e.querySelector('span')).backgroundImage:null,arrowBorder:e?getComputedStyle(e.querySelector('span')).borderRightWidth:null,roundButton:getComputedStyle(document.querySelector('.mobile-scroll-down')).borderRadius};
    });
    assert.match(hint.text,/Ещё подкатегории/);
    assert.equal(hint.arrowBackground,'none','The category cue should not contain the old arrow image');
    assert.equal(hint.roundButton,'50%','Category scroll control should be circular');

    await page.locator('#productGrid .product-card [data-add]').first().evaluate(el=>el.click());
    await page.waitForFunction(()=>document.querySelector('#productGrid .product-bottom.has-cart-quantity .card-cart-quantity strong')?.textContent==='1',null,{timeout:10000});
    await page.waitForTimeout(350); // Wait for the 250ms toast transition before measuring its viewport position.
    let result=await measure(page,'#productGrid .product-card .product-bottom.has-cart-quantity');
    console.log('CART METRICS '+JSON.stringify(result));
    assertNoOverlap(result,width,'catalog');
    assert.equal(result.counter,'1','The product card stepper should display only the number');
    assert.ok(result.toastTopGap>=8,'Cart confirmation must stay below the sticky header');
    await page.locator('#productGrid .card-cart-quantity [data-card-cart-delta="1"]').first().evaluate(e=>e.click());
    await page.waitForFunction(()=>document.querySelector('#productGrid .card-cart-quantity strong')?.textContent==='2');
    await page.locator('#productGrid .card-cart-quantity [data-card-cart-delta="-1"]').first().evaluate(e=>e.click());
    await page.waitForFunction(()=>document.querySelector('#productGrid .card-cart-quantity strong')?.textContent==='1');

    await page.locator('#productGrid .product-image-stage').first().evaluate(e=>e.click());
    await page.locator('.product-dialog[open]').waitFor({timeout:30000});
    await page.waitForFunction(()=>document.querySelector('#recentRow .recent-card'));
    await page.goBack({waitUntil:'domcontentloaded',timeout:15000}).catch(()=>{});
    await page.waitForTimeout(250);
    await page.locator('#recentRow .recent-card [data-add]').first().evaluate(e=>e.click());
    await page.waitForFunction(()=>document.querySelector('#recentRow .recent-bottom.has-cart-quantity .card-cart-quantity'));
    result=await measure(page,'#recentRow .recent-card .recent-bottom.has-cart-quantity');
    assertNoOverlap(result,width,'recent');
    assert.equal(result.counter,'2','Adding the same variant from recently viewed must update quantity');
    assert.deepEqual(pageErrors,[],'Page JavaScript errors');
    console.log('PASS: mobile quantity and category hint '+width+'px '+JSON.stringify(result));
    await context.close();
  }
}finally{await browser.close()}

async function measure(page,selector){
  return page.evaluate(selector=>{
    const wrap=document.querySelector(selector);
    const price=wrap.querySelector('.price-stack,.recent-prices');
    const step=wrap.querySelector('.card-cart-quantity');
    const numeric=step.querySelector('span');
    const addButton=wrap.querySelector('[data-add]');
    const toast=document.querySelector('#toast');
    const header=document.querySelector('.site-header');
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {wrap:rect(wrap),price:rect(price),step:rect(step),counter:numeric.textContent.trim(),hiddenAddDisplay:getComputedStyle(addButton).display,btns:[...step.querySelectorAll('button')].map(rect),toast:rect(toast),toastTopGap:toast.getBoundingClientRect().top-header.getBoundingClientRect().bottom,viewport:innerWidth};
  },selector);
}
function assertNoOverlap(m,width,kind){
  assert.equal(m.hiddenAddDisplay,'none',kind+' original add button remains visible: '+JSON.stringify(m));
  assert.ok(m.step.top>=m.price.bottom-2&&m.step.top-m.price.bottom<=20,kind+' stepper must follow price without overlap or empty button row: '+JSON.stringify(m));
  assert.ok(m.step.left>=m.wrap.left-2&&m.step.right<=m.wrap.right+2,kind+' stepper exceeds its card: '+JSON.stringify(m));
  assert.ok(m.btns.every(x=>x.width>=40&&x.height>=40),kind+' controls too small');
  assert.ok(m.wrap.right<=width+2,kind+' card exceeds the viewport');
}
