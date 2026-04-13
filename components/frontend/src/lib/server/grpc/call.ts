import type { ServiceError } from "@grpc/grpc-js"

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
