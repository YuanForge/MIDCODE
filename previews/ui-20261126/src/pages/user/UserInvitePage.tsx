import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/use-async'
import { getApiErrorMessage } from '@/lib/api/http'
import { userApi, type InviteeRecord, type InviteInfo, type WithdrawRecord } from '@/lib/api/user'
import { ConvertDialog } from '@/pages/user/invite/ConvertDialog'
import { WithdrawDialog } from '@/pages/user/invite/InviteDialogs'
import { InviteeTable } from '@/pages/user/invite/InviteeTable'
import { InviteSummary } from '@/pages/user/invite/InviteSummary'
import { QrSection } from '@/pages/user/invite/QrSection'
import { useQrEditor } from '@/pages/user/invite/useQrEditor'
import { WithdrawHistory } from '@/pages/user/invite/WithdrawHistory'

type InviteData = {
  info: InviteInfo
  wechatQr: string
  alipayQr: string
  withdrawals: WithdrawRecord[]
  withdrawalsTotal: number
}

const PAGE_SIZE = 20

/** Invite center: the overview, the payment QR codes, then two ledgers (withdrawals and invited users). */
export function UserInvitePage() {
  const [historyPage, setHistoryPage] = useState(1)

  const { data, loading, error: loadError, reload } = useAsync(
    async () => {
      const [inviteRes, qrRes, historyRes] = await Promise.all([
        userApi.getInviteInfo(),
        userApi.getPaymentQR(),
        userApi.listWithdrawHistory(historyPage, PAGE_SIZE),
      ])
      const withdrawals = Array.isArray(historyRes) ? historyRes : historyRes.records ?? historyRes.list ?? []
      return {
        info: inviteRes,
        wechatQr: qrRes.wechat_qr ?? '',
        alipayQr: qrRes.alipay_qr ?? '',
        withdrawals,
        withdrawalsTotal: Array.isArray(historyRes) ? withdrawals.length : historyRes.total ?? withdrawals.length,
      } satisfies InviteData
    },
    { info: {}, wechatQr: '', alipayQr: '', withdrawals: [], withdrawalsTotal: 0 } as InviteData,
    [historyPage],
  )

  const { data: invitees, loading: inviteesLoading } = useAsync(
    async () => {
      const res = await userApi.getInviteeList()
      return res.invitees ?? []
    },
    [] as InviteeRecord[],
    [],
  )

  const [mutError, setMutError] = useState('')
  const [convertOpen, setConvertOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('0')
  const [paymentType, setPaymentType] = useState('wechat')

  const error = loadError || mutError
  const info = data.info
  const inviteLink = info.invite_code ? `${window.location.origin}/register?ref=${info.invite_code}` : ''

  async function withMut(fn: () => Promise<void>) {
    setMutError('')
    try {
      await fn()
      reload()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  const qr = useQrEditor({ saved: { wechat: data.wechatQr, alipay: data.alipayQr }, run: withMut, onError: setMutError })

  async function submitWithdraw() {
    const amountValue = Number(withdrawAmount)
    const currentQr = (paymentType === 'wechat' ? qr.values.wechat : qr.values.alipay).trim()
    if (!amountValue || amountValue <= 0) {
      setMutError('请输入有效的提现积分数量')
      return
    }
    if (!currentQr) {
      setMutError(`请先保存${paymentType === 'wechat' ? '微信' : '支付宝'}收款码`)
      return
    }
    // The person types credits; the backend stores micro-credits (1 credit = 1,000,000).
    const microCredits = Math.round(amountValue * 1_000_000)
    await withMut(async () => {
      await userApi.submitWithdraw(microCredits, paymentType)
      setWithdrawOpen(false)
      setWithdrawAmount('0')
      setHistoryPage(1)
    })
  }

  return (
    <>
      <PageHeader
        title='邀请中心'
        description='分享邀请码获得返佣，返佣可解冻为可用积分或申请提现。'
        actions={error ? <Button variant='outline' onClick={reload}>重试</Button> : null}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <InviteSummary
        info={info}
        loading={loading}
        inviteLink={inviteLink}
        onConvert={() => setConvertOpen(true)}
        onWithdraw={() => setWithdrawOpen(true)}
      />
      <QrSection
        wechat={qr.values.wechat}
        alipay={qr.values.alipay}
        onChange={qr.set}
        onUpload={(kind, file) => void qr.upload(kind, file)}
        onSave={() => void qr.save()}
      />
      <WithdrawHistory
        rows={data.withdrawals}
        loading={loading}
        total={data.withdrawalsTotal}
        page={historyPage}
        pageSize={PAGE_SIZE}
        onPage={setHistoryPage}
      />
      <InviteeTable rows={invitees} loading={inviteesLoading} />

      <ConvertDialog open={convertOpen} onOpenChange={setConvertOpen} frozen={info.frozen_balance ?? 0} onDone={reload} />
      <WithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        amount={withdrawAmount}
        onAmountChange={setWithdrawAmount}
        paymentType={paymentType}
        onPaymentTypeChange={setPaymentType}
        onSubmit={() => void submitWithdraw()}
      />
    </>
  )
}
