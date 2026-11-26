import { SearchIcon } from 'lucide-react'

import { DateRangeFilter } from '@/components/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import type { ApiKeyRecord } from '@/lib/api/user'

export type LogFilterValues = {
  model: string
  status: string
  apiKeyId: string
  startAt: string
  endAt: string
}

/** Filter row for the call ledger. It sits on one glass sheet above the table, which is the record. */
export function LogFilters({
  values,
  onChange,
  apiKeys,
  onSearch,
  onReset,
}: {
  values: LogFilterValues
  onChange: (next: LogFilterValues) => void
  apiKeys: ApiKeyRecord[]
  onSearch: () => void
  onReset: () => void
}) {
  return (
    <div role='search' className='glass flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between'>
      <div className='flex flex-wrap items-center gap-2.5'>
        <Input
          placeholder='模型名称'
          aria-label='模型名称'
          value={values.model}
          onChange={(event) => onChange({ ...values, model: event.target.value })}
          className='w-full sm:w-44'
          onKeyDown={(event) => event.key === 'Enter' && onSearch()}
        />
        <NativeSelect
          aria-label='状态'
          value={values.status}
          onChange={(event) => onChange({ ...values, status: event.target.value })}
          className='w-full sm:w-36'
        >
          <option value=''>全部状态</option>
          <option value='ok'>成功 (ok)</option>
          <option value='error'>失败 (error)</option>
          <option value='refunded'>已退款 (refunded)</option>
          <option value='pending'>进行中 (pending)</option>
        </NativeSelect>
        <NativeSelect
          aria-label='API Key'
          value={values.apiKeyId}
          onChange={(event) => onChange({ ...values, apiKeyId: event.target.value })}
          className='w-full sm:w-44'
        >
          <option value=''>全部 API Key</option>
          {apiKeys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.name || `Key #${key.id}`}
            </option>
          ))}
        </NativeSelect>
        <DateRangeFilter
          startAt={values.startAt}
          endAt={values.endAt}
          onChange={({ startAt, endAt }) => onChange({ ...values, startAt, endAt })}
        />
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Button onClick={onSearch}>
          <SearchIcon data-icon='inline-start' />
          查询
        </Button>
        <Button variant='ghost' onClick={onReset}>
          重置
        </Button>
      </div>
    </div>
  )
}
