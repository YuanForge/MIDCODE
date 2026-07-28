import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react'
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

function providerKey(group: ApiKeyModelGroup) {
  return group.model_provider_id ? String(group.model_provider_id) : `legacy:${providerName(group)}`
}

export function officialDiscountLabel(group: ApiKeyModelGroup) {
  if (group.official_discount_status === 'inconsistent') return '折扣不一致'
  if (group.official_discount_status !== 'available' || !Number.isFinite(group.official_discount_bps)) return '暂无官方价'
  const folds = ((group.official_discount_bps as number) / 1000).toFixed(2).replace(/\.?0+$/, '')
  return `${folds}折`
}

export function ModelGroupSelector({ groups, selectedIds, onChange }: ModelGroupSelectorProps) {
  const providers = useMemo(() => {
    const grouped = new Map<string, {
      id: number
      key: string
      name: string
      active: boolean
      sortOrder: number
      groups: ApiKeyModelGroup[]
    }>()
    for (const group of groups) {
      const key = providerKey(group)
      const provider = grouped.get(key)
      if (provider) {
        provider.groups.push(group)
      } else {
        grouped.set(key, {
          id: group.model_provider_id ?? 0,
          key,
          name: providerName(group),
          active: group.model_provider_active !== false,
          sortOrder: group.model_provider_sort_order ?? 0,
          groups: [group],
        })
      }
    }
    return [...grouped.values()].sort((left, right) =>
      left.sortOrder - right.sortOrder || left.id - right.id || left.name.localeCompare(right.name),
    )
  }, [groups])
  const [requestedProvider, setRequestedProvider] = useState('')
  const [draggedGroupId, setDraggedGroupId] = useState<number>()
  const activeProvider = providers.some((provider) => provider.key === requestedProvider)
    ? requestedProvider
    : providers[0]?.key ?? ''

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id])
  }

  function orderedProviderGroups(providerGroups: ApiKeyModelGroup[]) {
    const groupById = new Map(providerGroups.flatMap((group) => group.id ? [[group.id, group] as const] : []))
    const selected = selectedIds.flatMap((id) => {
      const group = groupById.get(id)
      return group ? [group] : []
    })
    const selectedSet = new Set(selected.flatMap((group) => group.id ? [group.id] : []))
    return [...selected, ...providerGroups.filter((group) => !group.id || !selectedSet.has(group.id))]
  }

  function reorder(providerGroups: ApiKeyModelGroup[], sourceId: number, targetId: number) {
    const providerIds = new Set(providerGroups.flatMap((group) => group.id ? [group.id] : []))
    const ordered = selectedIds.filter((selectedId) => providerIds.has(selectedId))
    const sourceIndex = ordered.indexOf(sourceId)
    const targetIndex = ordered.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
    const [source] = ordered.splice(sourceIndex, 1)
    ordered.splice(targetIndex, 0, source)
    let cursor = 0
    onChange(selectedIds.map((selectedId) => providerIds.has(selectedId) ? ordered[cursor++] : selectedId))
  }

  function move(providerGroups: ApiKeyModelGroup[], id: number, direction: -1 | 1) {
    const ordered = selectedIds.filter((selectedId) => providerGroups.some((group) => group.id === selectedId))
    const index = ordered.indexOf(id)
    const targetId = ordered[index + direction]
    if (targetId !== undefined) reorder(providerGroups, id, targetId)
  }

  if (providers.length === 0) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">暂无可用模型分组</div>
  }

  return (
    <Tabs value={activeProvider} onValueChange={setRequestedProvider} className="min-w-0">
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList className="h-9 min-w-max">
          {providers.map((provider) => (
            <TabsTrigger key={provider.key} value={provider.key} className="h-8 gap-2 px-3">
              {provider.name}
              <Badge variant="secondary">{provider.groups.filter((group) => group.id && selectedIds.includes(group.id)).length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {providers.map((provider) => {
        const selectedProviderIds = selectedIds.filter((id) => provider.groups.some((group) => group.id === id))
        return (
          <TabsContent key={provider.key} value={provider.key} className="min-w-0 space-y-2">
            {orderedProviderGroups(provider.groups).map((group) => {
              if (!group.id) return null
              const name = group.name || group.code || String(group.id)
              const discountLabel = officialDiscountLabel(group)
              const localIndex = selectedProviderIds.indexOf(group.id)
              const selected = localIndex >= 0
              return (
                <div
                  key={group.id}
                  data-model-group-card={group.id}
                  data-model-group-selected={selected ? 'true' : 'false'}
                  onDragOver={(event) => {
                    if (draggedGroupId !== undefined && selected) event.preventDefault()
                  }}
                  onDragEnter={() => {
                    if (draggedGroupId !== undefined && selected) reorder(provider.groups, draggedGroupId, group.id as number)
                  }}
                  onDrop={() => setDraggedGroupId(undefined)}
                  className={`grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 transition-[border-color,box-shadow,opacity,background-color] ${draggedGroupId === group.id ? 'border-primary/60 bg-primary/5 opacity-60 shadow-sm' : ''}`}
                >
                  <Checkbox id={`model-group-${group.id}`} aria-label={group.code || name} checked={selected} disabled={!provider.active} onCheckedChange={() => toggle(group.id as number)} />
                  <Label htmlFor={`model-group-${group.id}`} className="min-w-0 cursor-pointer data-[disabled=true]:cursor-default" data-disabled={!provider.active}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px] font-normal">{discountLabel}</Badge>
                    </span>
                    <span className="block text-xs text-muted-foreground">{group.code} · {group.model_count ?? 0} 个模型</span>
                    {!provider.active ? <span className="block text-xs text-muted-foreground">企业已停用，该绑定将原样保留</span> : null}
                  </Label>
                  {selected ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {provider.active ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              draggable
                              aria-label={`拖动 ${name}`}
                              className="cursor-grab active:cursor-grabbing"
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', String(group.id))
                                setDraggedGroupId(group.id as number)
                              }}
                              onDragEnd={() => setDraggedGroupId(undefined)}
                            >
                              <GripVerticalIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>拖动排序</TooltipContent>
                        </Tooltip>
                      ) : null}
                      <Badge variant={localIndex === 0 ? 'default' : 'outline'} className="hidden sm:inline-flex">
                        {localIndex === 0 ? '优先使用' : `故障回退 ${localIndex}`}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`上移 ${name}`} disabled={!provider.active || localIndex === 0} onClick={() => move(provider.groups, group.id as number, -1)}><ArrowUpIcon /></Button>
                        </TooltipTrigger>
                        <TooltipContent>上移</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`下移 ${name}`} disabled={!provider.active || localIndex === selectedProviderIds.length - 1} onClick={() => move(provider.groups, group.id as number, 1)}><ArrowDownIcon /></Button>
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
