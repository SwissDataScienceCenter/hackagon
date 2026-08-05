<script lang="ts">
    import { resolve } from '$app/paths';
    import Plus from 'lucide-svelte/icons/plus';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import { statusLabel, statusBadgeVariant, membershipBadgeLabel, membershipBadgeVariant } from '$lib/utils/hackathonStatus';

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
        /**
         * Whether to offer hackathon creation. Mirrors the backend's own
         * `hackathon:create` — organizers and, via the admin escape hatch,
         * admins — so the button never lands anyone on a 403. The action is
         * still the backend's to refuse; this only decides whether to offer it.
         */
        canCreate?: boolean;
    }

    const { session, myHackathons, otherHackathons, canCreate = false }: Props = $props();
    const userName = session?.user?.name ?? 'there';

    // Decorative thumbnails for hackathons with no image of their own. Each
    // stop is derived from a theme token and darkened rather than naming a
    // palette step, so the set retunes with the theme instead of drifting from
    // it — and so it survives the secondary/tertiary palettes being removed.
    const GRADIENTS = [
        { from: 'var(--color-accent)', to: 'color-mix(in oklab, var(--color-accent) 35%, black)' },
        { from: 'var(--color-info)', to: 'color-mix(in oklab, var(--color-info) 35%, black)' },
        {
            from: 'var(--color-success)',
            to: 'color-mix(in oklab, var(--color-success) 35%, black)',
        },
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

<!-- Welcome Banner. Creating a hackathon rides here rather than beside "Your
     hackathons": it is the one action on this page that makes a new one rather
     than acting on the lists below. -->
<div class="flex flex-wrap items-start justify-between gap-4 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">Welcome back, {userName}</h1>
        <p class="text-sm text-ink-3">
            You are connected to {myHackathons.length} hackathon{myHackathons.length === 1 ? '' : 's'}
        </p>
    </div>

    {#if canCreate}
        <a
            href={resolve('/(app)/hackathons/create')}
            class="btn btn-sm btn-solid no-underline"
        >
            <Plus class="h-4 w-4" />
            Create Hackathon
        </a>
    {/if}
</div>

<!-- Body -->
<div class="px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-6">

        <!-- Your hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Your hackathons</h2>

            {#if myHackathons.length === 0}
                <p class="text-sm text-ink-3">You are not connected to any hackathons yet.</p>
            {:else}
                <div class="card overflow-hidden">
                    {#each myHackathons as h, i (h.id)}
                        {@const mem = h.viewerMembership}
                        <div class="flex items-center">
                            <div class="flex-1">
                                <!-- Member of this one: straight to the member view. -->
                                <HackathonRow
                                    href="/my/hackathon/{h.id}/overview"
                                    name={h.name}
                                    meta={formatMeta(h)}
                                    badge={statusLabel(h.status)}
                                    badgeVariant={statusBadgeVariant(h.status)}
                                    gradFrom={gradient(i).from}
                                    gradTo={gradient(i).to}
                                />
                            </div>
                            {#if mem}
                                <span class="mr-4 badge {membershipBadgeVariant(mem.isWaiting)} shrink-0">
                                    {membershipBadgeLabel(mem.isWaiting, mem.role)}
                                </span>
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
                <p class="text-sm text-ink-3">No other hackathons available.</p>
            {:else}
                <div class="card overflow-hidden">
                    {#each otherHackathons as h, i (h.id)}
                        <div class="flex items-center border-b border-line last:border-0">
                            <div class="flex-1">
                                <!-- Not a member: the public page is the only view open to us. -->
                                <HackathonRow
                                    href="/hackathon/{h.id}"
                                    name={h.name}
                                    meta={formatMeta(h)}
                                    badge={statusLabel(h.status)}
                                    badgeVariant={statusBadgeVariant(h.status)}
                                    gradFrom={gradient(i).from}
                                    gradTo={gradient(i).to}
                                />
                            </div>
                            <button
                                onclick={joinStub}
                                class="mr-4 btn btn-sm btn-accent shrink-0"
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
