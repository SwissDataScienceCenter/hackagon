// Standard gRPC v1 health service client.
// The backend registers the well-known grpc.health.v1.Health service
// (from go-grpc-middleware).  We define the service shape here so the
// frontend can call it without a separate proto generation step.
//
// Follows the same ts_proto pattern as the generated code.

import { createClientFactory } from "nice-grpc"
import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire"
import type { CallContext, CallOptions } from "nice-grpc-common"
import { backendChannel } from "./channel"

// ---------------------------------------------------------------------------
// Protobuf types for grpc.health.v1 (minimal, matching the well-known proto)
// ---------------------------------------------------------------------------

export enum ServingStatus {
  UNKNOWN = 0,
  SERVING = 1,
  NOT_SERVING = 2,
  SERVICE_UNKNOWN = 3,
}

export interface HealthCheckRequest {
  service?: string
}

export interface HealthCheckResponse {
  status: ServingStatus
}

// ---------------------------------------------------------------------------
// MessageFns — same shape as protoc-gen-ts_proto output
// ---------------------------------------------------------------------------

type Builtin =
  | Date
  | ((...args: unknown[]) => unknown)
  | Uint8Array
  | string
  | number
  | boolean
  | undefined

export interface MessageFns<T> {
  encode(message: T, writer?: BinaryWriter): BinaryWriter
  decode(input: BinaryReader | Uint8Array, length?: number): T
  fromJSON(object: unknown): T
  toJSON(message: T): unknown
  create(base?: DeepPartial<T>): T
  fromPartial(object: DeepPartial<T>): T
}

export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends globalThis.Array<infer U>
    ? globalThis.Array<DeepPartial<U>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : T extends Record<string, never>
        ? { [K in keyof T]?: DeepPartial<T[K]> }
        : Partial<T>

function createBaseHealthCheckRequest(): HealthCheckRequest {
  return {}
}

export const HealthCheckRequest: MessageFns<HealthCheckRequest> = {
  encode(
    _: HealthCheckRequest,
    writer: BinaryWriter = new BinaryWriter(),
  ): BinaryWriter {
    return writer
  },
  decode(
    input: BinaryReader | Uint8Array,
    length?: number,
  ): HealthCheckRequest {
    const reader =
      input instanceof BinaryReader ? input : new BinaryReader(input)
    const end = length === undefined ? reader.len : reader.pos + length
    const message = createBaseHealthCheckRequest()
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.service = reader.string()
          continue
      }
      if ((tag & 7) === 4 || tag === 0) break
      reader.skip(tag & 7)
    }
    return message
  },
  fromJSON(object: unknown): HealthCheckRequest {
    const svc = (object as Record<string, unknown>).service
    return { service: typeof svc === "string" ? svc : undefined }
  },
  toJSON(message: HealthCheckRequest): unknown {
    const obj: Record<string, unknown> = {}
    if (message.service !== undefined) obj.service = message.service
    return obj
  },
  create(base?: DeepPartial<HealthCheckRequest>): HealthCheckRequest {
    return HealthCheckRequest.fromPartial(base ?? {})
  },
  fromPartial(object: DeepPartial<HealthCheckRequest>): HealthCheckRequest {
    const message = createBaseHealthCheckRequest()
    if (object.service !== undefined && object.service !== null) {
      message.service = object.service
    }
    return message
  },
}

function createBaseHealthCheckResponse(): HealthCheckResponse {
  return { status: ServingStatus.UNKNOWN }
}

export const HealthCheckResponse: MessageFns<HealthCheckResponse> = {
  encode(
    message: HealthCheckResponse,
    writer: BinaryWriter = new BinaryWriter(),
  ): BinaryWriter {
    if (message.status !== undefined && message.status !== 0) {
      writer.uint32(8).int32(message.status)
    }
    return writer
  },
  decode(
    input: BinaryReader | Uint8Array,
    length?: number,
  ): HealthCheckResponse {
    const reader =
      input instanceof BinaryReader ? input : new BinaryReader(input)
    const end = length === undefined ? reader.len : reader.pos + length
    const message = createBaseHealthCheckResponse()
    while (reader.pos < end) {
      const tag = reader.uint32()
      switch (tag >>> 3) {
        case 1:
          message.status = reader.int32()
          continue
      }
      if ((tag & 7) === 4 || tag === 0) break
      reader.skip(tag & 7)
    }
    return message
  },
  fromJSON(object: unknown): HealthCheckResponse {
    const raw = (object as Record<string, unknown>).status
    return { status: typeof raw === "number" ? raw : ServingStatus.UNKNOWN }
  },
  toJSON(message: HealthCheckResponse): unknown {
    const obj: Record<string, unknown> = {}
    if (message.status !== undefined && message.status !== 0)
      obj.status = message.status
    return obj
  },
  create(base?: DeepPartial<HealthCheckResponse>): HealthCheckResponse {
    return HealthCheckResponse.fromPartial(base ?? {})
  },
  fromPartial(object: DeepPartial<HealthCheckResponse>): HealthCheckResponse {
    const message = createBaseHealthCheckResponse()
    if (object.status !== undefined && object.status !== null) {
      message.status = object.status
    }
    return message
  },
}

// ---------------------------------------------------------------------------
// Service definition — follows the ts_proto pattern so nice-grpc can
// convert it to a proper ServiceDefinition with serialize/deserialize.
// ---------------------------------------------------------------------------

export const HealthServiceDefinition = {
  name: "Health",
  fullName: "grpc.health.v1.Health",
  methods: {
    check: {
      name: "Check",
      requestType: HealthCheckRequest as typeof HealthCheckRequest,
      requestStream: false,
      responseType: HealthCheckResponse as typeof HealthCheckResponse,
      responseStream: false,
      options: {} as Record<string, never>,
    },
  },
} as const

export type HealthServiceDefinition = typeof HealthServiceDefinition
export type HealthServiceImplementation<
  CallContextExt = Record<string, never>,
> = {
  check(
    request: HealthCheckRequest,
    context: CallContext & CallContextExt,
  ): Promise<DeepPartial<HealthCheckResponse>>
}

export type HealthServiceClient<CallOptionsExt = Record<string, never>> = {
  check(
    request: DeepPartial<HealthCheckRequest>,
    options?: CallOptions & CallOptionsExt,
  ): Promise<HealthCheckResponse>
}

// ---------------------------------------------------------------------------
// Standalone client — dials through the shared channel from channel.ts
// ---------------------------------------------------------------------------

/** Standalone health client for the startup check in hooks.server.ts. */
export function healthClient(): HealthServiceClient {
  return createClientFactory().create(HealthServiceDefinition, backendChannel())
}
