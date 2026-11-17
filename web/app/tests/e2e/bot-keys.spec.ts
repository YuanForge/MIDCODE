import {test,expect} from '@playwright/test'
for(const root of [true,false]) test(`bot keys root=${root}`,async({page},info)=>{
 let active=true,created=false,fail=false;let secret='bot_fixture_secret_only';let reads=0
 await page.addInitScript(()=>{localStorage.setItem('admin_token','fixture');localStorage.setItem('fanapi_language','zh-CN')})
 await page.route('**/env.js',r=>r.fulfill({body:'window.__FANAPI_ENV__={site_name:"MidCode"}',contentType:'application/javascript'}))
 await page.route('**/api/**',r=>{const u=new URL(r.request().url());const send=(data:unknown,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
 if(u.pathname==='/api/admin/me')return send({id:root?1:2,role:'admin',permissions:root?['*']:['users:read']})
 if(u.pathname==='/api/admin/bot-keys'){
 if(r.request().method()==='POST'){if(fail)return send({error:'创建失败'},500);created=true;return send({id:1,key:secret},201)}
 reads++;return send({keys:created?[{id:'1',name:'测试机器人',is_active:String(active),created_at:'2026-11-17 12:00:00'}]:[]})}
 if(u.pathname==='/api/admin/bot-keys/1'){active=false;return r.fulfill({status:204})}return send({})})
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/admin/bot-keys')
 if(!root){await expect(page.getByText('仅主管理员可以管理机器人密钥。')).toBeVisible();expect(reads).toBe(0);return}
 await expect(page.getByText('暂无机器人密钥，请先创建。')).toBeVisible()
 await page.getByLabel('密钥名称').fill('测试机器人');fail=true;await page.getByRole('button',{name:'创建密钥',exact:true}).click();await expect(page.getByText('创建失败',{exact:true})).toBeVisible()
 fail=false;await page.getByRole('button',{name:'创建密钥',exact:true}).click();await expect(page.getByLabel('新机器人密钥')).toHaveValue(secret)
 expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain(secret)
 await page.screenshot({path:info.outputPath('created.png')});await page.getByRole('button',{name:'已保存，关闭'}).click();await expect(page.getByLabel('新机器人密钥')).toHaveCount(0)
 await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByText('启用',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'确认撤销'}).click();await expect(page.getByText('已撤销',{exact:true})).toBeVisible()
 await expect(page.getByRole('dialog')).toHaveCount(0);await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('mobile.png')});expect(errors).toEqual([])
})
