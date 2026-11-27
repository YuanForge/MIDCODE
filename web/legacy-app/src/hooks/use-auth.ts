import { useRoleToken } from './use-role-token'
import { getRoleToken } from '@/lib/auth/storage'
import { userApi, type UserProfileResponse } from "@/lib/api/user"
import { useAsync } from "./use-async"

export function useAuth() {
  const token = useRoleToken()
  const { data: user, loading } = useAsync(async () => {
    if (!getRoleToken('user')) return null as unknown as UserProfileResponse
    return await userApi.getProfile()
  }, null as unknown as UserProfileResponse, [token])

  return {
    user: token ? user : null,
    loading,
    isAuthenticated: !!token && !!user?.id
  }
}
