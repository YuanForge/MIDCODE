import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { UserLoginPage } from '@/pages/public/UserLoginPage'
import { RegisterPage } from '@/pages/public/RegisterPage'
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { useAuthDialogMode } from '@/hooks/use-role-token'
import { setAuthDialogMode } from '@/lib/auth/events'
import { useAuthCopy } from '@/i18n/auth-copy'
import { useRegistrationCopy } from '@/i18n/registration-copy'

export function ConsoleLoginDialog() {
  const a = useAuthCopy()
  const registration = useRegistrationCopy()
  const mode = useAuthDialogMode()
  const title = mode === 'recover' ? a.recover : mode === 'register' ? registration.title : a.loginTitle
  const description = mode === 'recover' ? a.recoverDesc : mode === 'register' ? registration.description : a.loginDesc
  return (
    <Dialog open={mode !== null} onOpenChange={open => { if (!open) setAuthDialogMode(null) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-[460px]">
        <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="px-6 pt-5"><LanguageSwitcher /></div>
        {mode === 'registered' ? <Alert className="mx-6 w-auto"><AlertDescription>{registration.success}</AlertDescription></Alert> : null}
        {mode === 'register' ? <RegisterPage embedded onLogin={() => setAuthDialogMode('login')} onSuccess={() => setAuthDialogMode('registered')} />
          : mode === 'recover' ? <ForgotPasswordPage embedded onBack={() => setAuthDialogMode('login')} />
          : mode ? <UserLoginPage embedded onRegister={() => setAuthDialogMode('register')} onRecover={() => setAuthDialogMode('recover')} onSuccess={() => setAuthDialogMode(null)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
