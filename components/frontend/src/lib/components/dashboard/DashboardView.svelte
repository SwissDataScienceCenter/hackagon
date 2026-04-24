<script lang="ts">
    import {
        Bell,
        UserPlus,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    interface SessionProp {
        user?: { name?: string | null; id?: string } | null;
    }

    interface Props {
        session: SessionProp | null | undefined;
    }

    const { session }: Props = $props();
    const userName = session?.user?.name ?? 'there';
</script>

<!-- Welcome Banner -->
<div class="px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">Welcome back, {userName}</h1>
        <p class="text-sm text-surface-500">
            You are registered in 1 active hackathon  ·  2 notifications
        </p>
    </div>
</div>

<!-- Body: main + sidebar -->
<div class="flex gap-6 px-4 py-8 sm:px-10 md:px-20">

    <!-- Main column -->
    <div class="flex flex-1 flex-col gap-6">

        <!-- Active hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Your active hackathons</h2>

            <div class="card preset-outlined-surface-200-800 overflow-hidden">
                <HackathonRow
                    href="/hackathon/ord-2026"
                    name="ORD Hackathon 2026"
                    meta="24 – 25 Oct 2026  ·  ETH Zurich  ·  Team: DataFlow (4 members)"
                    badge="Project Proposals"
                    badgePreset="preset-tonal-primary"
                    gradFrom="var(--color-primary-700)"
                    gradTo="var(--color-primary-950)"
                />
            </div>
        </section>

        <!-- Past participation -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Past participation</h2>

            {#each [
                { name: 'GenAI Hackathon 2025', meta: 'Nov 2025  ·  Team BioViz  ·  2nd place', gradFrom: 'var(--color-secondary-500)', gradTo: 'var(--color-secondary-950)', slug: 'genai-2025' },
                { name: 'ORD Hackathon 2025', meta: 'Oct 2025  ·  Team DataFlow  ·  1st place', gradFrom: 'var(--color-primary-700)', gradTo: 'var(--color-primary-950)', slug: 'ord-2025' },
            ] as row, i (i)}
                <div class="card preset-outlined-surface-200-800 overflow-hidden">
                    <HackathonRow
                        href="/hackathon/{row.slug}"
                        name={row.name}
                        meta={row.meta}
                        gradFrom={row.gradFrom}
                        gradTo={row.gradTo}
                        size="compact"
                    />
                </div>
            {/each}
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
