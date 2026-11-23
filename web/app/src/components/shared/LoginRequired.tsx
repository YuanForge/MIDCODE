import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { requestLogin } from '@/hooks/use-role-token'
import { useAuthCopy } from '@/i18n/auth-copy'

export function LoginRequired() {
  const a = useAuthCopy()
  return (
    <section className="guest-entry">
      <div>
        <h2 className="text-2xl font-semibold">{a.required}</h2>
        <p className="my-4 text-sm text-muted-foreground">{a.browse}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={requestLogin}>{a.login}</Button>
          <Button variant="outline" asChild><Link to="/models">{a.models}</Link></Button>
        </div>
      </div>
      <img src="/landing/orbit.png" alt="" />
    </section>
  )
}
