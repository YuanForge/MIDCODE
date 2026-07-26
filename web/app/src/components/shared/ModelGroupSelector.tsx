import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ApiKeyModelGroup } from '@/lib/api/user'

export type ModelGroupSelectorProps = {
  groups: ApiKeyModelGroup[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

const unconfiguredProvider = '未配置企业'

function providerName(group: ApiKeyModelGroup) {
  return group.model_provider?.trim() || unconfiguredProvider
}

export function ModelGroupSelector({ groups, selectedIds, onChange }: ModelGroupSelectorProps) {
  const providers = useMemo(() => {
    const grouped = new Map<string, ApiKeyModelGroup[]>()
    for (const group of groups) {
      const provider = providerName(group)
      grouped.set(provider, [...(grouped.get(provider) ?? []), group])
    }
    return [...grouped.entries()].map(([name, providerGroups]) => ({ name, groups: providerGroups }))
  }, [groups])
  const [requestedProvider, setRequestedProvider] = useState('')
  const activeProvider = providers.some((provider) => provider.name === requestedProvider)
    ? requestedProvider
    : providers[0]?.name ?? ''

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id])
  }

  function move(provider: string, id: number, direction: -1 | 1) {
    const providerIds = new Set(groups.filter((group) => group.id && providerName(group) === provider).map((group) => group.id as number))
    const ordered = selectedIds.filter((selectedId) => providerIds.has(selectedId))
    const index = ordered.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    let cursor = 0
    onChange(selectedIds.map((selectedId) => providerIds.has(selectedId) ? ordered[cursor++] : selectedId))
  }

  if (providers.length === 0) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">暂无可用模型分组</div>
  }

  return (
    <Tabs value={activeProvider} onValueChange={setRequestedProvider} className="min-w-0">
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList className="h-9 min-w-max">
          {providers.map((provider) => (
            <TabsTrigger key={provider.name} value={provider.name} className="h-8 gap-2 px-3">
              {provider.name}
              <Badge variant="secondary">{provider.groups.filter((group) => group.id && selectedIds.includes(group.id)).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {providers.map((provider) => {
        const selectedProviderIds = selectedIds.filter((id) => provider.groups.some((group) => group.id === id))
        return (
          <TabsContent key={provider.name} value={provider.name} className="min-w-0 space-y-2">
            {provider.groups.map((group) => {
              if (!group.id) return null
              const name = group.name || group.code || String(group.id)
              const localIndex = selectedProviderIds.indexOf(group.id)
              const selected = localIndex >= 0
              return (
                <div key={group.id} className="grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2">
                  <Checkbox id={`model-group-${group.id}`} aria-label={group.code || name} checked={selected} onCheckedChange={() => toggle(group.id as number)} />
                  <Label htmlFor={`model-group-${group.id}`} className="min-w-0 cursor-pointer">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block text-xs text-muted-foreground">{group.code} · {group.model_count ?? 0} 个模型</span>
                  </Label>
                  {selected ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={localIndex === 0 ? 'default' : 'outline'} className="hidden sm:inline-flex">
                        {localIndex === 0 ? '优先使用' : `故障回退 ${localIndex}`}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`上移 ${name}`} disabled={localIndex === 0} onClick={() => move(provider.name, group.id as number, -1)}><ArrowUpIcon /></Button>
                        </TooltipTrigger>
                        <TooltipContent>上移</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`下移 ${name}`} disabled={localIndex === selectedProviderIds.length - 1} onClick={() => move(provider.name, group.id as number, 1)}><ArrowDownIcon /></Button>
                        </TooltipTrigger>
                        <TooltipContent>下移</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
