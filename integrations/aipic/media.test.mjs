import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createImageMedia } from './media.mjs'
import { signedToken, readToken } from '../media-storage/store.mjs'

test('tampered, malformed and oversized capabilities are rejected', () => {
 const token=signedToken({key:'image/example'},'secret')
 assert.deepEqual(readToken(token,'secret'),{key:'image/example'})
 assert.equal(readToken(token,'different'),null)
 assert.equal(readToken(token+'x','secret'),null)
 assert.equal(readToken('a'.repeat(3000),'secret'),null)
})
test('image upload requires handoff, same origin and produces renewable object-only link', async t => {
 const stored=new Map()
 const media=createImageMedia({secret:'a'.repeat(40),store:{put:async(k,b,type)=>stored.set(k,{b,type}),url:async k=>'https://s3.fanapi.cc/private/'+k+'?signed=short'}})
 const server=createServer(async(req,res)=>{try{await media.handle(req,res,new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(500).end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close())
 const root=`http://127.0.0.1:${server.address().port}`
 const cookie=media.session({apiKey:'test-user-a'}).split(';')[0]
 const headers={'Origin':'https://image.midcode.cc','Content-Type':'image/png','Cookie':cookie}
 assert.equal((await fetch(root+'/midcode/media',{method:'POST',headers:{...headers,Cookie:''},body:'sample'})).status,401)
 assert.equal((await fetch(root+'/midcode/media',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'sample'})).status,403)
 const result=await fetch(root+'/midcode/media',{method:'POST',headers,body:'sample'})
 assert.equal(result.status,200);const data=await result.json();const path=new URL(data.url).pathname
 const read=await fetch(root+path,{redirect:'manual'});assert.equal(read.status,302);assert.match(read.headers.get('location'),/^https:\/\/s3\.fanapi\.cc\//)
 assert.equal(stored.size,1);assert.equal([...stored.values()][0].b.toString(),'sample')
 assert.equal((await fetch(root+path+'x',{redirect:'manual'})).status,403)
 const cookie2=media.session({apiKey:'test-user-b'}).split(';')[0]
 await fetch(root+'/midcode/media',{method:'POST',headers:{...headers,Cookie:cookie2},body:'sample'})
 assert.equal(stored.size,2)
})
