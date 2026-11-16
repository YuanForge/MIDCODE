import { test, expect } from '@playwright/test'
test('model statistics load only in opened details and can retry independently', async ({page},info)=>{
 const calls:string[]=[];let fail=true
 await page.addInitScript(()=>{localStorage.setItem('token','fixture');localStorage.setItem('fanapi_language','zh-CN')})
 await page.route('**/env.js',r=>r.fulfill({contentType:'application/javascript',body:'window.__FANAPI_ENV__={site_name:"MidCode"}'}))
 await page.route('**/api/**',async r=>{
 const u=new URL(r.request().url());const send=(body:unknown,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
 if(u.pathname.endsWith('/channels')) return send({channels:['gpt-5.6-sol','gpt-6-astra'].map((name,i)=>({id:i+1,name,routing_model:name,type:'llm',protocol:'responses',billing_type:'token',price_display:'¥1.3600 / 1M 输入',model_provider:'OpenAI'}))})
 if(u.pathname.endsWith('/model-availability')) {calls.push(u.searchParams.get('model')??'ALL');if(fail)return send({error:'unavailable'},500);return send({models:[{routing_model:u.searchParams.get('model'),total:10,success:9,availability_percent:90,p50_latency_ms:123,ttft_ms:200,tps:30,ttft_samples:9,tps_samples:9,recent:[]}]})}
 if(u.pathname.endsWith('/model-preferences'))return send({preferences:[]})
 if(u.pathname.endsWith('/profile'))return send({id:3,username:'fixture',role:'user'})
 return send({})
 })
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/models');await expect(page.locator('[data-model]')).toHaveCount(2)
 expect(calls).toEqual([]);await expect(page.getByText('成功率',{exact:true})).toHaveCount(0)
 await page.screenshot({path:info.outputPath('initial.png')})
 await page.locator('[data-model="gpt-5.6-sol"]').click();await expect(page.getByRole('button',{name:'重试统计'})).toBeVisible();expect(calls).toEqual(['gpt-5.6-sol'])
 fail=false;await page.getByRole('button',{name:'重试统计'}).click();await expect(page.getByText('90.00%')).toBeVisible()
 await page.screenshot({path:info.outputPath('expanded.png')});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
 await page.setViewportSize({width:390,height:844});await page.locator('[data-model="gpt-6-astra"]').click();await expect(page.getByText('90.00%')).toBeVisible();expect(calls).toEqual(['gpt-5.6-sol','gpt-5.6-sol','gpt-6-astra']);expect(errors).toEqual([])
 await page.screenshot({path:info.outputPath('mobile.png')})
})
