<script lang="ts">
    import { resolve } from '$app/paths';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import { statusLabel, statusBadgePreset, membershipBadgeLabel, membershipBadgePreset, isOwnerRole } from '$lib/utils/hackathonStatus';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonEntry {
        id: string;
        name: string;
        startsAt?: Date;
        endsAt?: Date;
        status: number;
        viewerMembership?: HackathonMember;
    }

    interface SessionProp {
        user?: { name?: string | null; id?: string } | null;
    }

    interface Props {
        session: SessionProp | null | undefined;
        myHackathons: HackathonEntry[];
        otherHackathons: HackathonEntry[];
        isGlobalAdmin: boolean;
    }

    const { session, myHackathons, otherHackathons, isGlobalAdmin }: Props = $props();
    const userName = session?.user?.name ?? 'there';

    const GRADIENTS = [
        { from: 'var(--color-primary-700)', to: 'var(--color-primary-950)' },
        { from: 'var(--color-secondary-500)', to: 'var(--color-secondary-950)' },
        { from: 'var(--color-tertiary-500)', to: 'var(--color-tertiary-950)' },
    ];

    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length]!;
    }

    function formatMeta(h: HackathonEntry): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '';
    }

    function joinStub() {
        alert('Join: not yet implemented');
    }
</script>

<!-- Welcome Banner -->
<div class="px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex flex-col gap-1">
            <h1 class="text-2xl font-bold">Welcome back, {userName}</h1>
            <p class="text-sm text-surface-500">
                You are connected to {myHackathons.length} hackathon{myHackathons.length === 1 ? '' : 's'}
            </p>
        </div>
        {#if isGlobalAdmin}
            <a href={resolve('/(admin)/users')} class="btn btn-sm preset-filled-primary-500 no-underline shrink-0">
                Site Admin
            </a>
        {/if}
    </div>
</div>

<!-- Body -->
<div class="flex gap-6 px-4 py-8 sm:px-10 md:px-20">

    <div class="flex flex-1 flex-col gap-6">

        <!-- Your hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Your hackathons</h2>

            {#if myHackathons.length === 0}
                <p class="text-sm text-surface-500">You are not connected to any hackathons yet.</p>
            {:else}
                <div class="card preset-outlined-surface-200-800 overflow-hidden">
                    {#each myHackathons as h, i (h.id)}
                        {@const mem = h.viewerMembership}
                        <div class="flex items-center">
                            <div class="flex-1">
                                <HackathonRow
                                    href="/hackathon/{h.id}"
                                    name={h.name}
                                    meta={formatMeta(h)}
                                    badge={statusLabel(h.status)}
                                    badgePreset={statusBadgePreset(h.status)}
                                    gradFrom={gradient(i).from}
                                    gradTo={gradient(i).to}
                                />
                            </div>
                            {#if mem}
                                <div class="mr-4 flex shrink-0 items-center gap-3">
                                    <span class="badge {membershipBadgePreset(mem.isWaiting)}">
                                        {membershipBadgeLabel(mem.isWaiting, mem.role)}
                                    </span>
                                    {#if !mem.isWaiting}
                                        <div class="flex items-center gap-2">
                                            {#if isOwnerRole(mem.role)}
                                                <a
                                                    href={resolve(`/hackathon/${h.id}/overview`)}
                                                    class="btn btn-sm preset-outlined-primary-500 no-underline"
                                                >
                                                    Enter as Participant
                                                </a>
                                                <a
                                                    href={resolve(`/admin/hackathon/${h.id}`)}
                                                    class="btn btn-sm preset-filled-primary-500 no-underline"
                                                >
                                                    Enter as Admin
                                                </a>
                                            {:else}
                                                <a
                                                    href={resolve(`/hackathon/${h.id}/overview`)}
                                                    class="btn btn-sm preset-filled-primary-500 no-underline"
                                                >
                                                    Enter
                                                </a>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Other hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Other hackathons</h2>

            {#if otherHackathons.length === 0}
                <p class="text-sm text-surface-500">No other hackathons available.</p>
            {:else}
                <div class="card preset-outlined-surface-200-800 overflow-hidden">
                    {#each otherHackathons as h, i (h.id)}
                        <div class="flex items-center border-b border-surface-200-800 last:border-0">
                            <div class="flex-1">
                                <HackathonRow
                                    href="/hackathon/{h.id}"
                                    name={h.name}
                                    meta={formatMeta(h)}
                                    badge={statusLabel(h.status)}
                                    badgePreset={statusBadgePreset(h.status)}
                                    gradFrom={gradient(i).from}
                                    gradTo={gradient(i).to}
                                />
                            </div>
                            <button
                                onclick={joinStub}
                                class="mr-4 btn btn-sm preset-tonal-primary shrink-0"
                            >
                                Join
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>
    </div>
</div>
