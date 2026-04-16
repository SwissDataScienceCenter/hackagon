<script lang="ts">
    import { resolve } from '$app/paths';
    import {
        Settings,
        ArrowRight,
        ChevronRight,
        Bell,
        UserPlus,
        User,
        FileText,
    } from 'lucide-svelte';

    const { data } = $props();
    const userName = data.session?.user?.name ?? 'there';
</script>

<!-- Welcome Banner -->
<div
    class="flex items-center justify-between border-b border-surface-200 px-20 py-8 dark:border-surface-800"
>
    <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">Welcome back, {userName}</h1>
        <p class="text-sm text-surface-500">
            You are registered in 1 active hackathon  ·  2 notifications
        </p>
    </div>
    <a
        href={resolve('/dashboard')}
        class="btn btn-sm preset-outlined-surface-200-800 no-underline"
    >
        <Settings class="h-3.5 w-3.5" />
        Settings
    </a>
</div>

<!-- Body: main + sidebar -->
<div class="flex gap-6 px-20 py-8">

    <!-- Main column -->
    <div class="flex flex-1 flex-col gap-6">

        <!-- Active hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Your active hackathons</h2>

            <a
                href={resolve('/dashboard')}
                class="card preset-outlined-surface-200-800 flex items-center gap-5
                       p-5 no-underline hover:border-primary-500 transition-colors"
            >
                <div
                    class="h-16 w-16 shrink-0"
                    style="background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-950))"
                ></div>
                <div class="flex flex-1 flex-col gap-1.5">
                    <div class="flex items-center gap-3">
                        <span class="text-base font-semibold">ORD Hackathon 2026</span>
                        <span class="badge preset-tonal-primary">
                            Project Proposals
                        </span>
                    </div>
                    <span class="text-xs text-surface-500">
                        24 – 25 Oct 2026  ·  ETH Zurich  ·  Team: DataFlow (4 members)
                    </span>
                    <div class="mt-1 h-1 w-full bg-surface-200 dark:bg-surface-800">
                        <div class="h-full w-1/3 bg-primary-500"></div>
                    </div>
                </div>
                <ArrowRight class="h-4 w-4 shrink-0 text-surface-500" />
            </a>
        </section>

        <!-- Past participation -->
        <section class="flex flex-col gap-4">
            <h2 class="text-base font-bold">Past participation</h2>

            {#each [
                { name: 'GenAI Hackathon 2025', meta: 'Nov 2025  ·  Team BioViz  ·  2nd place', gradFrom: 'var(--color-secondary-500)', gradTo: 'var(--color-secondary-950)' },
                { name: 'ORD Hackathon 2025', meta: 'Oct 2025  ·  Team DataFlow  ·  1st place', gradFrom: 'var(--color-primary-700)', gradTo: 'var(--color-primary-950)' },
            ] as row, i (i)}
                <a
                    href={resolve('/dashboard')}
                    class="card preset-outlined-surface-200-800 flex h-14 items-center gap-4
                           px-4 no-underline hover:border-primary-500 transition-colors"
                >
                    <div
                        class="h-9 w-9 shrink-0"
                        style="background: linear-gradient(135deg, {row.gradFrom}, {row.gradTo})"
                    ></div>
                    <div class="flex flex-1 flex-col gap-0.5">
                        <span class="text-sm font-medium">{row.name}</span>
                        <span class="text-xs text-surface-500">{row.meta}</span>
                    </div>
                    <ChevronRight class="h-3.5 w-3.5 text-surface-500" />
                </a>
            {/each}
        </section>
    </div>

    <!-- Sidebar -->
    <div class="flex w-80 shrink-0 flex-col gap-6">

        <!-- Notifications -->
        <div class="card preset-outlined-surface-200-800 overflow-hidden">
            <div class="flex h-10 items-center justify-between border-b border-surface-200 px-4 dark:border-surface-800">
                <span class="text-sm font-semibold">Notifications</span>
                <span class="badge-icon preset-filled-primary-500 text-xs">
                    2
                </span>
            </div>
            <div class="flex items-start gap-3 border-b border-surface-200 p-4 dark:border-surface-800">
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

        <!-- Quick Links -->
        <div class="card preset-outlined-surface-200-800 overflow-hidden">
            <div class="flex h-10 items-center border-b border-surface-200 px-4 dark:border-surface-800">
                <span class="text-sm font-semibold">Quick Links</span>
            </div>
            {#each [
                { icon: User, label: 'Edit Profile' },
                { icon: FileText, label: 'My Submissions' },
                { icon: Settings, label: 'Account Settings' },
            ] as link, i (i)}
                {@const Icon = link.icon}
                <a
                    href={resolve('/dashboard')}
                    class="flex h-9 items-center gap-2 px-4 text-xs text-surface-500
                           no-underline hover:text-primary-500 transition-colors"
                >
                    <Icon class="h-3.5 w-3.5" />
                    {link.label}
                </a>
            {/each}
        </div>
    </div>
</div>
