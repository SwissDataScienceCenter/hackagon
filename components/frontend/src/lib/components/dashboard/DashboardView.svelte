<script lang="ts">
    import {
        Bell,
        UserPlus,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import { statusLabel, statusBadgePreset } from '$lib/utils/hackathonStatus';

    interface HackathonEntry {
        id: string;
        name: string;
        startsAt?: Date;
        endsAt?: Date;
        status: number;
    }

    interface SessionProp {
        user?: { name?: string | null; id?: string } | null;
    }

    interface Props {
        session: SessionProp | null | undefined;
        hackathons: HackathonEntry[];
        myHackathons: HackathonEntry[];
    }

    const { session, hackathons, myHackathons }: Props = $props();
    const userName = session?.user?.name ?? 'there';

    const GRADIENTS = [
        { from: 'var(--color-primary-700)', to: 'var(--color-primary-950)' },
        { from: 'var(--color-secondary-500)', to: 'var(--color-secondary-950)' },
        { from: 'var(--color-tertiary-500)', to: 'var(--color-tertiary-950)' },
    ];

    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length];
    }

    function formatMeta(h: HackathonEntry): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '';
    }
</script>

<!-- Welcome Banner -->
<div class="px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">Welcome back, {userName}</h1>
        <p class="text-sm text-surface-500">
            You are participating in {myHackathons.length} hackathon{myHackathons.length === 1 ? '' : 's'}
        </p>
    </div>
</div>

<!-- Body: main + sidebar -->
<div class="flex gap-6 px-4 py-8 sm:px-10 md:px-20">

    <!-- Main column -->
    <div class="flex flex-1 flex-col gap-6">

        <!-- All hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">All hackathons</h2>

            {#if hackathons.length === 0}
                <p class="text-sm text-surface-500">No hackathons yet.</p>
            {:else}
                <div class="card preset-outlined-surface-200-800 overflow-hidden">
                    {#each hackathons as h, i (h.id)}
                        <HackathonRow
                            href="/hackathon/{h.id}"
                            name={h.name}
                            meta={formatMeta(h)}
                            badge={statusLabel(h.status)}
                            badgePreset={statusBadgePreset(h.status)}
                            gradFrom={gradient(i).from}
                            gradTo={gradient(i).to}
                        />
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Your hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Your hackathons</h2>

            {#if myHackathons.length === 0}
                <p class="text-sm text-surface-500">You are not participating in any hackathons yet.</p>
            {:else}
                <div class="card preset-outlined-surface-200-800 overflow-hidden">
                    {#each myHackathons as h, i (h.id)}
                        <HackathonRow
                            href="/hackathon/{h.id}"
                            name={h.name}
                            meta={formatMeta(h)}
                            badge={statusLabel(h.status)}
                            badgePreset={statusBadgePreset(h.status)}
                            gradFrom={gradient(i).from}
                            gradTo={gradient(i).to}
                        />
                    {/each}
                </div>
            {/if}
        </section>
    </div>

    <!-- Sidebar -->
    <div class="flex w-80 shrink-0 flex-col gap-6">

        <!-- Notifications -->
        <div class="card preset-outlined-surface-200-800 overflow-hidden">
            <div
                class="flex h-10 items-center justify-between border-b border-surface-200-800 px-4"
            >
                <span class="text-sm font-semibold">Notifications</span>
                <span class="badge-icon preset-filled-primary-500 text-xs">
                    2
                </span>
            </div>
            <div class="flex items-start gap-3 border-b border-surface-200-800 p-4">
                <Bell class="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
                <div class="flex flex-col gap-1">
                    <p class="text-xs leading-snug">
                        Project proposals are due in 5 days for ORD Hackathon 2026.
                    </p>
                    <span class="text-xs text-surface-500">2 hours ago</span>
                </div>
            </div>
            <div class="flex items-start gap-3 p-4">
                <UserPlus class="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary-500" />
                <div class="flex flex-col gap-1">
                    <p class="text-xs leading-snug">
                        You were added to Team DataFlow by Carlos.
                    </p>
                    <span class="text-xs text-surface-500">1 day ago</span>
                </div>
            </div>
        </div>
    </div>
</div>
