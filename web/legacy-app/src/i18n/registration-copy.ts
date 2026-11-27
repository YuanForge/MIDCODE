import { useTranslation } from 'react-i18next'
const en = { title: 'Create an account', description: 'Create your account using an email verification code.', username: 'Username', sent: 'Code sent. It is valid for 5 minutes.', existing: 'Already have an account?', success: 'Account created. Sign in to continue.', emailRequired: 'Enter a valid email address first.' }
type Copy = typeof en
const copies: Record<string, Copy> = {
 'en-US': en,
 'zh-CN': { title:'创建账号',description:'使用邮箱验证码创建用户账号。',username:'用户名',sent:'验证码已发送，5 分钟内有效。',existing:'已有账号？',success:'注册成功，请登录后继续。',emailRequired:'请先填写有效的邮箱地址。' },
 'zh-TW': { title:'建立帳號',description:'使用電子郵件驗證碼建立帳號。',username:'使用者名稱',sent:'驗證碼已寄出，5 分鐘內有效。',existing:'已有帳號？',success:'註冊成功，請登入後繼續。',emailRequired:'請先填寫有效的電子郵件地址。' },
 'es-ES': { title:'Crear una cuenta',description:'Crea tu cuenta con un código de verificación por correo.',username:'Nombre de usuario',sent:'Código enviado. Es válido durante 5 minutos.',existing:'¿Ya tienes cuenta?',success:'Cuenta creada. Inicia sesión para continuar.',emailRequired:'Introduce primero un correo electrónico válido.' },
 'fr-FR': { title:'Créer un compte',description:'Créez votre compte avec un code de vérification par e-mail.',username:'Nom d’utilisateur',sent:'Code envoyé. Il est valable 5 minutes.',existing:'Vous avez déjà un compte ?',success:'Compte créé. Connectez-vous pour continuer.',emailRequired:'Saisissez d’abord une adresse e-mail valide.' },
 'de-DE': { title:'Konto erstellen',description:'Erstelle dein Konto mit einem Bestätigungscode per E-Mail.',username:'Benutzername',sent:'Code gesendet. Er gilt 5 Minuten.',existing:'Bereits ein Konto?',success:'Konto erstellt. Melde dich an, um fortzufahren.',emailRequired:'Gib zuerst eine gültige E-Mail-Adresse ein.' },
 'ja-JP': { title:'アカウントを作成',description:'メール認証コードでアカウントを作成します。',username:'ユーザー名',sent:'コードを送信しました。有効期限は5分です。',existing:'アカウントをお持ちですか？',success:'登録が完了しました。ログインして続行してください。',emailRequired:'有効なメールアドレスを入力してください。' },
 'ko-KR': { title:'계정 만들기',description:'이메일 인증 코드로 계정을 만드세요.',username:'사용자 이름',sent:'코드를 보냈습니다. 5분 동안 유효합니다.',existing:'이미 계정이 있으신가요?',success:'계정이 생성되었습니다. 로그인하여 계속하세요.',emailRequired:'유효한 이메일 주소를 먼저 입력하세요.' },
 'pt-PT': { title:'Criar conta',description:'Crie a sua conta com um código de verificação por e-mail.',username:'Nome de utilizador',sent:'Código enviado. É válido durante 5 minutos.',existing:'Já tem conta?',success:'Conta criada. Inicie sessão para continuar.',emailRequired:'Introduza primeiro um endereço de e-mail válido.' },
 'ru-RU': { title:'Создать аккаунт',description:'Создайте аккаунт с помощью кода подтверждения по почте.',username:'Имя пользователя',sent:'Код отправлен. Он действителен 5 минут.',existing:'Уже есть аккаунт?',success:'Аккаунт создан. Войдите, чтобы продолжить.',emailRequired:'Сначала укажите действительный адрес электронной почты.' },
}
export function useRegistrationCopy(): Copy {
 const { i18n } = useTranslation()
 return copies[i18n.language] ?? en
}
