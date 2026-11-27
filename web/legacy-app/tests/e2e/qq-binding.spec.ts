import {test,expect} from '@playwright/test'
test('bind edit conflict unbind QQ on profile',async({page},info)=>{
 let qq='',conflict=false,verified=false
 await page.addInitScript(()=>{localStorage.setItem('token','fixture');localStorage.setItem('fanapi_language','zh-CN')})
 await page.route('**/env.js',r=>r.fulfill({body:'window.__FANAPI_ENV__={site_name:"MidCode"}',contentType:'application/javascript'}))
 await page.route('**/api/**',r=>{const u=new URL(r.request().url()),method=r.request().method();const send=(body:unknown,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
 if(u.pathname.endsWith('/qq-binding')){if(method==='PUT'){if(conflict)return send({error:'该QQ已被其他账号绑定'},409);qq=r.request().postDataJSON().qq}if(method==='DELETE'){qq='';return r.fulfill({status:204})}return send({qq,verified,status:verified?'bound':'pending'})}
 if(u.pathname.endsWith('/profile'))return send({id:3,username:'fixture',role:'user'})
 if(u.pathname.endsWith('/balance'))return send({balance_credits:1000000})
 return send({})})
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/profile');await expect(page.getByText('未绑定',{exact:true})).toBeVisible()
 await page.getByLabel('QQ 号',{exact:true}).fill('12345');await page.getByRole('button',{name:'提交绑定申请',exact:true}).click();await expect(page.getByText('12345',{exact:true})).toBeVisible()
 await expect(page.getByText('（待群内验证）')).toBeVisible();verified=true;await page.getByRole('button',{name:'刷新绑定状态'}).click();await expect(page.getByText('（已绑定）')).toBeVisible();conflict=true;await page.getByLabel('新 QQ 号').fill('67890');await page.getByRole('button',{name:'重新提交绑定'}).click();await expect(page.getByText('该QQ已被其他账号绑定')).toBeVisible();await expect(page.getByText('12345',{exact:true})).toBeVisible()
 conflict=false;await page.getByRole('button',{name:'重新提交绑定'}).click();await expect(page.getByText('67890',{exact:true})).toBeVisible()
 await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'绑定 QQ',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('qq-mobile.png')})
 await page.getByRole('button',{name:'解绑 QQ',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();expect(qq).toBe('67890')
 await page.getByRole('button',{name:'解绑 QQ',exact:true}).click();await page.getByRole('button',{name:'确认解绑'}).click();await expect(page.getByText('未绑定',{exact:true})).toBeVisible();expect(errors).toEqual([])
})
