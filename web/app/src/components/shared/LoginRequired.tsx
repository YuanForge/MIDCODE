import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { requestLogin } from '@/hooks/use-role-token'
import { useAuthCopy } from '@/i18n/auth-copy'
export function LoginRequired() {
 const a=useAuthCopy()
 return <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8 text-center"><h2 className="text-lg font-semibold">{a.required}</h2><p className="text-sm text-muted-foreground">{a.browse}</p><Button onClick={requestLogin}>{a.login}</Button><Link className="text-sm text-primary" to="/models">{a.models}</Link></div>
}
