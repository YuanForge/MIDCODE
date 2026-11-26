import { FilterIcon } from 'lucide-react'

import { FilterBar } from '@/components/shared/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { UserFilterState } from '@/pages/admin/users/userFormat'

type TextKey = 'email' | 'uid' | 'group'

/** One row of compact controls: email, uid, status, group and a balance range. Nothing is requested until the person presses search. */
export function UserFilters({
  value,
  onField,
  onSearch,
  onReset,
}: {
  value: UserFilterState
  onField: <K extends keyof UserFilterState>(key: K, next: UserFilterState[K]) => void
  onSearch: () => void
  onReset: () => void
}) {
  const enter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') onSearch()
  }
  const text = (key: TextKey, label: string, width: string, placeholder: string) => (
    <Input
      aria-label={label}
      className={`h-8 ${width}`}
      placeholder={placeholder}
      value={value[key]}
      onChange={(event) => onField(key, event.target.value)}
      onKeyDown={enter}
    />
  )

  return (
    <FilterBar
      className='lg:items-center'
      filters={
        <>
          {text('email', '邮箱', 'w-52', '邮箱（模糊匹配）')}
          {text('uid', 'UID', 'w-32', 'UID（精确）')}
          <Select value={value.status || '_all'} onValueChange={(next) => onField('status', next === '_all' ? '' : next)}>
            <SelectTrigger aria-label='状态' className='h-8 w-28'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all'>全部状态</SelectItem>
              <SelectItem value='active'>正常</SelectItem>
              <SelectItem value='frozen'>冻结</SelectItem>
            </SelectContent>
          </Select>
          {text('group', '分组', 'w-32', '分组，如 vip')}
          <div role='group' aria-label='余额范围（¥）' className='flex items-center gap-1'>
            <Input aria-label='最小余额' className='h-8 w-28' placeholder='最小余额 ¥' value={value.balance_min} onChange={(event) => onField('balance_min', event.target.value)} onKeyDown={enter} />
            <span className='text-muted-foreground'>-</span>
            <Input aria-label='最大余额' className='h-8 w-28' placeholder='最大余额 ¥' value={value.balance_max} onChange={(event) => onField('balance_max', event.target.value)} onKeyDown={enter} />
          </div>
        </>
      }
      actions={
        <>
          <Button size='sm' onClick={onSearch}>
            <FilterIcon data-icon='inline-start' />
            查询
          </Button>
          <Button size='sm' variant='outline' onClick={onReset}>
            重置
          </Button>
        </>
      }
    />
  )
}
