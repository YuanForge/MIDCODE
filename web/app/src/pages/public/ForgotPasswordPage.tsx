import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api/public'
import { useAuthCopy } from '@/i18n/auth-copy'
import { getApiErrorMessage } from '@/lib/api/http'
export function ForgotPasswordPage({ onBack, embedded = false }: { onBack?: () => void; embedded?: boolean }) {
 const a = useAuthCopy()
 const [email,setEmail] = useState('')
 const [code,setCode] = useState('')
 const [password,setPassword] = useState('')
 const [confirm,setConfirm] = useState('')
 const [busy,setBusy] = useState(false)
 const [sent,setSent] = useState(false)
 const [done,setDone] = useState(false)
 const [error,setError] = useState('')
 const [remaining,setRemaining] = useState(0)
 useEffect(() => { if (!remaining) return; const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000); return ()=>clearTimeout(timer) },[remaining])
 async function sendCode(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true);setError('')
  try {await authApi.forgotPassword(email.trim());setSent(true);setRemaining(60)} catch {setError(a.failed)} finally {setBusy(false)}
 }
 async function reset(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();setError('')
  if(password.length<8 || password.length>128){setError(a.length);return}
  if(password!==confirm){setError(a.mismatch);return}
  setBusy(true)
  try {await authApi.resetPassword({email:email.trim(),code:code.trim(),password});setDone(true);setCode('');setPassword('');setConfirm('')} catch (err) {setError(getApiErrorMessage(err).includes('验证码') ? a.invalidCode : a.failed)} finally {setBusy(false)}
 }
 return <Card className={embedded ? 'w-full border-0 shadow-none' : 'w-full max-w-[440px] shadow-lg'}>
  <CardHeader><CardTitle>{a.recover}</CardTitle><CardDescription>{a.recoverDesc}</CardDescription></CardHeader>
  <CardContent className="flex flex-col gap-4">
   {done ? <Alert><AlertDescription>{a.done}</AlertDescription></Alert> : <>
    <form className="flex flex-col gap-3" onSubmit={sendCode}>
     <Label htmlFor="recovery-email">{a.email}</Label><Input id="recovery-email" type="email" required autoComplete="email" value={email} disabled={busy} onChange={event=>{setEmail(event.target.value);setSent(false);setCode('');setError('')}} />
     <Button type="submit" variant="outline" disabled={busy || remaining>0}>{busy ? a.busy : remaining>0 ? a.resend+' ('+remaining+'s)' : sent ? a.resend : a.send}</Button>
    </form>
    {sent ? <Alert><AlertDescription>{a.sent}</AlertDescription></Alert> : null}
    <form className="flex flex-col gap-3" onSubmit={reset}>
     <Label htmlFor="recovery-code">{a.code}</Label><Input id="recovery-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value)} />
     <Label htmlFor="recovery-password">{a.newPassword}</Label><Input id="recovery-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} />
     <Label htmlFor="recovery-confirm">{a.confirm}</Label><Input id="recovery-confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)} />
     <Button disabled={busy || !email.trim()}>{busy ? a.busy : a.reset}</Button>
    </form>
   </>}
   {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
  </CardContent>
  <CardFooter className="justify-center">{onBack ? <Button variant="link" onClick={onBack}>{a.back}</Button> : <Link to="/login">{a.back}</Link>}</CardFooter>
 </Card>
}
