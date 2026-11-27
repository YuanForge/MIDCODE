import { useRef, useState, useSyncExternalStore } from 'react'
import axios from 'axios'
import GoCaptcha from 'go-captcha-react'
import 'go-captcha-react/dist/go-captcha-react.cjs.development.css'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getApiErrorMessage } from '@/lib/api/http'
import { useAsync } from '@/hooks/use-async'
import { getCaptchaRequest, subscribeCaptcha, finishCaptcha, type CaptchaRequest } from '@/lib/auth/captcha'
import { useCaptchaCopy } from '@/i18n/captcha-copy'

type Challenge = { id:string; kind:string; image:string; thumb:string; tile_width:number; tile_height:number; tile_x:number; tile_y:number; thumb_size:number }
type Answer = { points?:{x:number;y:number}[]; x?:number; y?:number; angle?:number }
const api=axios.create({baseURL:'/api/auth/captcha',timeout:15000})
function ChallengeForm({request}:{request:CaptchaRequest}) {
  const copy=useCaptchaCopy()
  const [busy,setBusy]=useState(false)
  const [failed,setFailed]=useState(false)
  const [verifyError,setVerifyError]=useState('')
  const verifying=useRef(false)
  const {data,loading,error,reload}=useAsync(async()=> (await api.post<Challenge>('/new',{purpose:request.purpose,subject:request.subject})).data,null as Challenge|null,[request.id])
  async function verify(answer:Answer) {
    if(!data || verifying.current || getCaptchaRequest()?.id!==request.id)return
    verifying.current=true
    setBusy(true)
    setVerifyError('')
    try {
      const response=await api.post<{token:string}>('/verify',{id:data.id,purpose:request.purpose,subject:request.subject,answer})
      if(typeof response.data.token!=='string' || !response.data.token)throw new Error(copy.unavailable)
      if(getCaptchaRequest()?.id===request.id)finishCaptcha(response.data.token)
    } catch (error) {
      if(getCaptchaRequest()?.id!==request.id)return
      if(axios.isAxiosError(error) && error.response?.data?.code==='CAPTCHA_REQUIRED') {setFailed(true);reload()}
      else setVerifyError(getApiErrorMessage(error))
    } finally {verifying.current=false;setBusy(false)}
  }
  const refresh=()=>{if(!verifying.current){setVerifyError('');setFailed(false);reload()}}
  const events={refresh,close:()=>{if(getCaptchaRequest()?.id===request.id)finishCaptcha()}}
  const tile=data?{image:data.image,thumb:data.thumb,thumbWidth:data.tile_width,thumbHeight:data.tile_height,thumbX:data.tile_x,thumbY:data.tile_y}:null
  return <div className="flex min-w-0 flex-col items-center gap-3">
    <div aria-live="polite" className="text-sm text-muted-foreground">{loading?copy.loading:error?error:verifyError?verifyError:failed?copy.failed:''}</div>
    {data && !loading && !error ? <div className={busy?'pointer-events-none opacity-60':''} aria-busy={busy}>
      {data.kind.startsWith('click_')?<GoCaptcha.Click key={data.id} config={{horizontalPadding:0,title:copy.click,buttonText:copy.confirm}} data={{image:data.image,thumb:data.thumb}} events={{...events,confirm:points=>{void verify({points:points.map(p=>({x:Math.round(p.x),y:Math.round(p.y)}))})}}}/>
      :data.kind==='rotate'?<GoCaptcha.Rotate key={data.id} config={{horizontalPadding:0,title:copy.rotate}} data={{image:data.image,thumb:data.thumb,thumbSize:data.thumb_size}} events={{...events,confirm:angle=>{void verify({angle:Math.round(angle)})}}}/>
      :data.kind==='drag'&&tile?<GoCaptcha.SlideRegion key={data.id} config={{horizontalPadding:0,title:copy.drag}} data={tile} events={{...events,confirm:p=>{void verify({x:Math.round(p.x),y:Math.round(p.y)})}}}/>
      :data.kind==='slide'&&tile?<GoCaptcha.Slide key={data.id} config={{horizontalPadding:0,title:copy.slide}} data={tile} events={{...events,confirm:p=>{void verify({x:Math.round(p.x),y:Math.round(p.y)})}}}/>:null}
    </div>:null}
    <Button variant="outline" disabled={busy||loading} onClick={refresh}>{copy.retry}</Button>
  </div>
}
export function CaptchaDialog(){
 const request=useSyncExternalStore(subscribeCaptcha,getCaptchaRequest,()=>null)
 const copy=useCaptchaCopy()
 return <Dialog open={request!==null} onOpenChange={open=>{if(!open)finishCaptcha()}}><DialogContent className="max-h-[95dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto px-0 sm:max-w-[380px]">
  <DialogHeader className="px-4"><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.description}</DialogDescription></DialogHeader>
  {request?<ChallengeForm key={request.id} request={request}/>:null}
 </DialogContent></Dialog>
}
