<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
    const pending = $derived(hackathon.members.filter((m) => m.isWaiting));
    const approvedCount = $derived(hackathon.members.length - pending.length);

    const stats = $derived([
        { label: 'Approved participants', value: approvedCount },
        { label: 'Pending approval', value: pending.length },
        { label: 'Pages', value: hackathon.pages.length },
        { label: 'Phases', value: hackathon.phases.length },
        { label: 'Tracks', value: hackathon.tracks.length },
        { label: 'Projects', value: hackathon.projects.length },
    ]);

    let rowErrors: Record<string, string> = $state({});

    function initials(displayName: string, username: string): string {
        const source = displayName.trim() || username;
        return source
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }

</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <p class="m-0 text-sm text-surface-500">
        Managing pages, phases and tracks from here is coming soon.
    </p>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {#each stats as stat (stat.label)}
            <div class="card preset-outlined-surface-200-800 flex flex-col gap-1 p-4">
                <span class="text-2xl font-bold">{stat.value}</span>
                <span class="text-xs text-surface-500">{stat.label}</span>
            </div>
        {/each}
    </div>

    <div class="flex flex-col gap-4">
        <h2 class="m-0 text-base font-bold">Pending participants</h2>

        {#if pending.length === 0}
            <p class="m-0 text-sm text-surface-500">No pending participants.</p>
        {:else}
            <div class="card preset-outlined-surface-200-800 overflow-hidden">
                {#each pending as member (member.user?.id)}
                    {@const userId = member.user?.id ?? ''}
                    <div
                        class="flex items-center gap-3 border-b border-surface-200-800 px-4 py-3 last:border-0"
                    >
                        <div
                            class="flex size-8 shrink-0 items-center justify-center rounded-full
                                   border-2 border-surface-200-800 bg-surface-200-800 text-[10px]
                                   font-bold text-surface-950-50"
                        >
                            {initials(member.user?.displayName ?? '', member.user?.username ?? '')}
                        </div>
                        <div class="flex flex-1 flex-col gap-0.5">
                            <span class="text-sm font-semibold">
                                {member.user?.displayName || member.user?.username}
                            </span>
                            <span class="text-xs text-surface-500">
                                {member.user?.email} · joined {formatDate(member.joinedAt)}
                            </span>
                        </div>
                        {#if rowErrors[userId]}
                            <span class="text-xs text-error-500">{rowErrors[userId]}</span>
                        {/if}
                        <form
                            method="POST"
                            action="?/remove"
                            use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') {
                                        rowErrors[userId] =
                                            (result.data as { message?: string } | undefined)?.message ??
                                            'Could not remove.';
                                    } else {
                                        delete rowErrors[userId];
                                    }
                                    await update();
                                };
                            }}
                        >
                            <input type="hidden" name="userId" value={userId} />
                            <button type="submit" class="btn btn-sm preset-tonal-surface">Remove</button>
                        </form>
                        <form
                            method="POST"
                            action="?/approve"
                            use:enhance={() => {
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') {
                                        rowErrors[userId] =
                                            (result.data as { message?: string } | undefined)?.message ??
                                            'Could not approve.';
                                    } else {
                                        delete rowErrors[userId];
                                    }
                                    await update();
                                };
                            }}
                        >
                            <input type="hidden" name="userId" value={userId} />
                            <button type="submit" class="btn btn-sm preset-filled-primary-500">Approve</button>
                        </form>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
