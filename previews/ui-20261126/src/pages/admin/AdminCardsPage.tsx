import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmAction } from '@/components/shared/ConfirmAction'
import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsync } from '@/hooks/use-async'
import { adminApi, type AdminCard, type AdminCardBatch, type AdminVendor } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/http'
import { BatchesTable } from '@/pages/admin/cards/BatchesTable'
import { CardFilters } from '@/pages/admin/cards/CardFilters'
import { CardsTable } from '@/pages/admin/cards/CardsTable'
import { ExportUnused } from '@/pages/admin/cards/ExportUnused'
import { GenerateCards } from '@/pages/admin/cards/GenerateCards'
import { UsesTable } from '@/pages/admin/cards/UsesTable'
import { CARD_PAGE_SIZE } from '@/pages/admin/cards/cardFormat'

type TabView = 'batches' | 'cards' | 'uses'

/** Cards by batch, by card, and by redemption. Generating and exporting are flows of their own; voiding and deleting ask first. */
export function AdminCardsPage() {
  const [tab, setTab] = useState<TabView>('batches')
  const [statusFilter, setStatusFilter] = useState('')
  const [cardPage, setCardPage] = useState(1)
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({ page: 1, size: CARD_PAGE_SIZE })

  const { data: batchRows, loading: batchLoading, error: batchError, reload: reloadBatches } = useAsync(async () => {
    const res = await adminApi.listCardBatches()
    return res.batches ?? []
  }, [] as AdminCardBatch[], [])

  const { data: cardData, loading, error: loadError, reload } = useAsync(async () => {
    const response = await adminApi.listCards(queryParams)
    return { cards: response.cards ?? [], total: response.total ?? 0 }
  }, { cards: [] as AdminCard[], total: 0 }, [queryParams])

  const { data: usedRows, loading: usedLoading, error: usedError } = useAsync(async () => {
    const response = await adminApi.listCards({ status: 'used', page: 1, size: 500 })
    return response.cards ?? []
  }, [] as AdminCard[], [tab === 'uses' ? 1 : 0])

  const { data: vendors } = useAsync(async () => {
    const res = await adminApi.listVendors({})
    return (Array.isArray(res) ? res : (res as { vendors?: AdminVendor[]; items?: AdminVendor[] }).vendors ?? (res as { items?: AdminVendor[] }).items ?? []) as AdminVendor[]
  }, [] as AdminVendor[], [])

  const [mutError, setMutError] = useState('')
  const [pendingDeleteCard, setPendingDeleteCard] = useState<AdminCard | null>(null)
  const [pendingVoidCardId, setPendingVoidCardId] = useState<number | null>(null)
  const [pendingVoidBatchId, setPendingVoidBatchId] = useState<string | null>(null)

  const shownError = loadError || mutError

  async function run(action: () => Promise<void>) {
    setMutError('')
    try {
      await action()
    } catch (err) {
      setMutError(getApiErrorMessage(err))
    }
  }

  async function executeVoidCard() {
    const id = pendingVoidCardId
    setPendingVoidCardId(null)
    if (id == null) return
    await run(async () => {
      await adminApi.voidCard(id)
      reload()
    })
  }

  async function executeVoidBatch() {
    const batchId = pendingVoidBatchId
    setPendingVoidBatchId(null)
    if (!batchId) return
    await run(async () => {
      const res = await adminApi.voidCardBatch(batchId)
      toast.success(`已作废 ${(res as { voided?: number }).voided ?? 0} 张未使用卡密`)
      reloadBatches()
      reload()
    })
  }

  async function executeDeleteCard() {
    const card = pendingDeleteCard
    setPendingDeleteCard(null)
    if (!card?.id) return
    await run(async () => {
      await adminApi.deleteCard(card.id!)
      reload()
    })
  }

  function search() {
    setCardPage(1)
    setQueryParams({ page: 1, size: CARD_PAGE_SIZE, ...(statusFilter ? { status: statusFilter } : {}) })
  }

  function reset() {
    setStatusFilter('')
    setCardPage(1)
    setQueryParams({ page: 1, size: CARD_PAGE_SIZE })
  }

  function changePage(next: number) {
    setCardPage(next)
    setQueryParams((prev) => ({ ...prev, page: next }))
  }

  return (
    <>
      <PageHeader
        title='卡密管理'
        description='批量生成、作废卡密，按批次或明细查看。'
        actions={
          <>
            {shownError ? (
              <Button variant='outline' onClick={reload}>
                重试
              </Button>
            ) : null}
            <ExportUnused batches={batchRows} />
            <GenerateCards
              vendors={vendors}
              onGenerated={() => {
                reload()
                reloadBatches()
              }}
            />
          </>
        }
      />
      {shownError ? (
        <Alert variant='destructive'>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabView)}>
        <TabsList>
          <TabsTrigger value='batches'>批次管理</TabsTrigger>
          <TabsTrigger value='cards'>卡密列表</TabsTrigger>
          <TabsTrigger value='uses'>使用记录</TabsTrigger>
        </TabsList>

        <TabsContent value='batches' className='mt-4'>
          {batchError ? (
            <Alert variant='destructive'>
              <AlertDescription>{batchError}</AlertDescription>
            </Alert>
          ) : (
            <BatchesTable rows={batchRows} loading={batchLoading} onVoid={setPendingVoidBatchId} />
          )}
        </TabsContent>

        <TabsContent value='cards' className='mt-4 flex flex-col gap-6'>
          <CardFilters status={statusFilter} onStatus={setStatusFilter} onSearch={search} onReset={reset} />
          <CardsTable
            rows={cardData.cards}
            loading={loading}
            page={cardPage}
            total={cardData.total}
            onPage={changePage}
            onVoid={setPendingVoidCardId}
            onDelete={setPendingDeleteCard}
          />
        </TabsContent>

        <TabsContent value='uses' className='mt-4'>
          {usedError ? (
            <Alert variant='destructive'>
              <AlertDescription>{usedError}</AlertDescription>
            </Alert>
          ) : (
            <UsesTable rows={usedRows} loading={usedLoading} />
          )}
        </TabsContent>
      </Tabs>

      <ConfirmAction
        open={pendingDeleteCard !== null}
        onClose={() => setPendingDeleteCard(null)}
        title='确认删除'
        description={`确认删除卡密 ${pendingDeleteCard?.code ?? pendingDeleteCard?.id ?? ''} 吗？此操作不可撤销。`}
        confirmLabel='删除'
        onConfirm={() => void executeDeleteCard()}
      />
      <ConfirmAction
        open={pendingVoidCardId != null}
        onClose={() => setPendingVoidCardId(null)}
        title='确认作废'
        description='确认作废此卡密吗？作废后该卡密将无法使用，此操作不可撤销。'
        confirmLabel='确认作废'
        onConfirm={() => void executeVoidCard()}
      />
      <ConfirmAction
        open={pendingVoidBatchId != null}
        onClose={() => setPendingVoidBatchId(null)}
        title='确认批量作废'
        description='确认作废该批次所有未使用卡密吗？作废后该批次未使用卡密将全部失效，此操作不可撤销。'
        confirmLabel='确认作废'
        onConfirm={() => void executeVoidBatch()}
      />
    </>
  )
}
