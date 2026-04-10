import { healthClient } from '$lib/server/grpc/client';
import { json } from '@sveltejs/kit';

export const GET = async () => {
    return new Promise((resolve) => {
        healthClient.check({ service: 'backend' }, (err: any, response: any) => {
            if (err) {
                resolve(json({ error: err.message }, { status: 500 }));
            } else {
                resolve(json(response));
            }
        });
    });
};
