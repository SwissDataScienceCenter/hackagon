import * as grpc from '@grpc/grpc-js';
import { HealthClient } from './generated/health';

export const healthClient = new HealthClient(
    'localhost:3000',
    grpc.credentials.createInsecure()
);
