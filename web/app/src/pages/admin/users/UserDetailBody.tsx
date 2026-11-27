import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AdminUser } from '@/lib/api/admin'
import type { ActionMode } from '@/pages/admin/users/actions'
import { UserInfoTab } from '@/pages/admin/users/UserInfoTab'
import { UserOplog } from '@/pages/admin/users/UserOplog'
import { UserPortrait } from '@/pages/admin/users/UserPortrait'

export type UserDetailActions = {
  onAction: (mode: ActionMode) => void
  onUnfreeze: () => void
  onRefreshVip: () => void
}

/**
 * One account in three tabs. This is the whole content of the detail, so the dialog and the panel beside the table
 * show the same thing. The error line is for what failed here, such as unfreezing.
 */
export function UserDetailBody({ user, error, onAction, onUnfreeze, onRefreshVip }: { user: AdminUser; error: string } & UserDetailActions) {
  return (
    <>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue='info'>
        <TabsList>
          <TabsTrigger value='info'>基本信息</TabsTrigger>
          <TabsTrigger value='portrait'>用户画像</TabsTrigger>
          <TabsTrigger value='oplog'>操作日志</TabsTrigger>
        </TabsList>
        <TabsContent value='info'>
          <UserInfoTab user={user} onAction={onAction} onUnfreeze={onUnfreeze} onRefreshVip={onRefreshVip} />
        </TabsContent>
        <TabsContent value='portrait'>{user.id ? <UserPortrait userId={user.id} /> : null}</TabsContent>
        <TabsContent value='oplog'>{user.id ? <UserOplog userId={user.id} /> : null}</TabsContent>
      </Tabs>
    </>
  )
}
