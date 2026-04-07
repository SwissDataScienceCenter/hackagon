<script lang="ts">
    import type { Session } from '@auth/sveltekit';

    let { session }: { session: Session | null } = $props();
</script>

<aside class="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto
    border-l border-surface-300-700 p-4">
    {#if session?.user}
        <div class="flex flex-col gap-2">
            <div class="font-semibold">Welcome back, {session.user.name}</div>
        </div>
    {:else}
        <p class="text-sm opacity-75">
            Sign up or Log in to see more options
        </p>
    {/if}
</aside>
