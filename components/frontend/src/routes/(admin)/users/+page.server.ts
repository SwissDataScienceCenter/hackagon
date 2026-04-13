import type { PageServerLoad } from "./$types"
import { callGrpc } from "$lib/server/grpc/call"
import { userClient } from "$lib/server/grpc/client"
import type { UserListResponse } from "$lib/server/grpc/generated/user"

export const load: PageServerLoad = async () => {
  const result = await callGrpc<UserListResponse>((cb) =>
    userClient.list({}, cb),
  )
  return { users: result.users }
}
