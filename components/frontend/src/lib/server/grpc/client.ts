import * as grpc from "@grpc/grpc-js"
import { HealthClient } from "./generated/health"
import { UserClient } from "./generated/user"

const address = "localhost:3000"
const credentials = grpc.credentials.createInsecure()

export const healthClient = new HealthClient(address, credentials)
export const userClient = new UserClient(address, credentials)
