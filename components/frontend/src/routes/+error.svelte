<script lang="ts">
    import { page } from '$app/state';
    import { AlertTriangle } from 'lucide-svelte';
    import { resolve } from '$app/paths';

    const status = page.status;
    const message = page.error?.message;
</script>

<div class="flex min-h-screen flex-col items-center justify-center px-4">
    <div class="card flex w-full max-w-lg flex-col items-center gap-4 p-8 text-center">
        <AlertTriangle class="text-danger-ink" size={64} stroke-width={1.5} />
        <h1 class="m-0 text-display">{status}</h1>

        <p class="prose m-0 text-ink-2">
            {message || 'An unexpected error occurred.'}
        </p>

        <hr class="my-2 w-full border-line" />

        <a href={resolve('/')} class="btn btn-outline-accent no-underline">
            Go back to Homepage
        </a>
    </div>
</div>
