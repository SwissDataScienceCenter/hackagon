import { type ServiceError, status as grpcStatus } from "@grpc/grpc-js"
import { json, type RequestHandler } from "@sveltejs/kit"

export type GrpcCallback<Res> = (err: ServiceError | null, res: Res) => void

export function callGrpc<Res>(
  invoke: (cb: GrpcCallback<Res>) => void,
): Promise<Res> {
  return new Promise<Res>((resolve, reject) => {
    invoke((err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const grpcToHttpStatus: Record<number, number> = {
  [grpcStatus.INVALID_ARGUMENT]: 400,
  [grpcStatus.UNAUTHENTICATED]: 401,
  [grpcStatus.PERMISSION_DENIED]: 403,
  [grpcStatus.NOT_FOUND]: 404,
  [grpcStatus.ALREADY_EXISTS]: 409,
  [grpcStatus.FAILED_PRECONDITION]: 412,
  [grpcStatus.RESOURCE_EXHAUSTED]: 429,
  [grpcStatus.CANCELLED]: 499,
  [grpcStatus.UNAVAILABLE]: 503,
  [grpcStatus.DEADLINE_EXCEEDED]: 504,
}

export function grpcStatusToHttp(code?: number): number {
  if (code === undefined) return 500
  return grpcToHttpStatus[code] ?? 500
}

export function apiHandler(fn: RequestHandler): RequestHandler {
  return async (event) => {
    try {
      return await fn(event)
    } catch (err) {
      const grpcErr = err as ServiceError
      const httpStatus = grpcStatusToHttp(grpcErr.code)
      return json({ error: grpcErr.message }, { status: httpStatus })
    }
  }
}
