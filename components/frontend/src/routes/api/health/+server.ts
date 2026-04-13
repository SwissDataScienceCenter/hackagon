import { healthClient } from '$lib/server/grpc/client';
import type { HealthCheckResponse } from '$lib/server/grpc/generated/health';
import type { ServiceError } from '@grpc/grpc-js';
import { json } from '@sveltejs/kit';

export const GET = async () => {
    return new Promise((resolve) => {
        healthClient.check({}, (err: ServiceError | null, response: HealthCheckResponse) => {
            if (err) {
                resolve(json({ error: err.message }, { status: 500 }));
            } else {
                resolve(json(response));
            }
        });
    });
};
