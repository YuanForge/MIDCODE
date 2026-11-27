import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ProxyRule } from '@/pages/admin/settings/settingsModel'

/** Which upstream address prefix is swapped for which proxy prefix in task results. Rows with an empty side are dropped on save. */
export function ProxyRulesEditor({ rules, onChange }: { rules: ProxyRule[]; onChange: (next: ProxyRule[]) => void }) {
  function patch(index: number, change: Partial<ProxyRule>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)))
  }

  return (
    <div className='flex flex-col gap-2'>
      {rules.length > 0 ? (
        <>
          <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 text-xs text-muted-foreground'>
            <span>上游前缀（from）</span>
            <span>替换为（to）</span>
            <span />
          </div>
          <ul className='flex flex-col gap-2'>
            {rules.map((rule, index) => (
              <li key={index} className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2'>
                <Input aria-label={`第 ${index + 1} 条规则的上游前缀`} value={rule.from} onChange={(event) => patch(index, { from: event.target.value })} placeholder='https://upload.apimart.ai' className='font-mono text-xs' />
                <Input aria-label={`第 ${index + 1} 条规则的替换前缀`} value={rule.to} onChange={(event) => patch(index, { to: event.target.value })} placeholder='https://api.example.com/apimart' className='font-mono text-xs' />
                <Button type='button' variant='ghost' size='icon-sm' className='text-destructive' aria-label={`删除第 ${index + 1} 条规则`} onClick={() => onChange(rules.filter((_, i) => i !== index))}>
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Button type='button' variant='outline' size='sm' className='self-start' onClick={() => onChange([...rules, { from: '', to: '' }])}>
        <PlusIcon data-icon='inline-start' />
        添加规则
      </Button>
    </div>
  )
}
