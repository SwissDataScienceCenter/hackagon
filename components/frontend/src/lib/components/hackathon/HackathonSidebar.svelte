<script lang="ts">
    import {
        ListOrdered,
        FilePlus,
        User,
        Settings,
        Archive,
        Building,
        Mail,
        PlusCircle,
        BarChart3,
    } from 'lucide-svelte';
    import type { Component } from 'svelte';

    let {
        primaryAction,
        primaryActionHref,
        secondaryAction,
        secondaryActionHref,
        deadline,
        teamName,
        teamMemberCount,
        isAdmin = false,
    }: {
        primaryAction: string;
        primaryActionHref: string;
        secondaryAction: string;
        secondaryActionHref: string;
        deadline: string;
        teamName: string;
        teamMemberCount: number;
        isAdmin?: boolean;
    } = $props();

    const navLinks: { icon: Component; label: string }[] = [
        { icon: User, label: 'Your profile' },
        { icon: Settings, label: 'Account settings' },
        { icon: Archive, label: 'Previous Hackathons' },
        { icon: Building, label: 'About SDSC' },
        { icon: Mail, label: 'Contact us' },
    ];

    const adminLinks: { icon: Component; label: string }[] = [
        { icon: PlusCircle, label: 'Create Hackathon' },
        { icon: BarChart3, label: 'Admin Dashboard' },
    ];
</script>

<aside class="flex w-72 shrink-0 flex-col gap-4">
    <div class="card preset-outlined-surface-200-800 overflow-hidden">
        <div class="flex flex-col gap-2 p-4">
            <a href={primaryActionHref} class="btn btn-sm preset-filled-primary-500 w-full no-underline">
                <ListOrdered class="h-3.5 w-3.5" />
                {primaryAction}
            </a>
            <a href={secondaryActionHref} class="btn btn-sm preset-outlined-surface-200-800 w-full no-underline">
                <FilePlus class="h-3.5 w-3.5" />
                {secondaryAction}
            </a>
            <span class="text-center text-xs text-warning-500">{deadline}</span>
        </div>

        <div class="border-t border-surface-200 p-4 dark:border-surface-800">
            <span class="text-xs font-bold tracking-widest text-surface-500">YOUR TEAM</span>
            <p class="mt-1.5 text-sm font-semibold">{teamName}</p>
            <div class="mt-2 flex -space-x-1.5">
                {#each Array(teamMemberCount) as _, i (i)}
                    <div class="h-6 w-6 rounded-full bg-surface-200 ring-2 ring-surface-50 dark:bg-surface-700 dark:ring-surface-900"></div>
                {/each}
            </div>
            <a href="#team" class="mt-2 block text-xs text-primary-700 no-underline hover:underline dark:text-primary-500">View Team Page →</a>
        </div>
    </div>

    <div class="card preset-outlined-surface-200-800 overflow-hidden p-4">
        <div class="flex flex-col gap-0.5">
            {#each navLinks as link (link.label)}
                <a href="#" class="flex h-7 items-center gap-2 text-xs text-surface-500 no-underline transition-colors hover:text-primary-500">
                    <svelte:component this={link.icon} class="h-3.5 w-3.5" />
                    {link.label}
                </a>
            {/each}
        </div>

        {#if isAdmin}
            <div class="mt-3 border-t border-surface-200 pt-3 dark:border-surface-800">
                <span class="text-xs font-bold tracking-widest text-surface-500">ADMIN</span>
                <div class="mt-1 flex flex-col gap-0.5">
                    {#each adminLinks as link (link.label)}
                        <a href="#" class="flex h-7 items-center gap-2 text-xs text-surface-500 no-underline transition-colors hover:text-primary-500">
                            <svelte:component this={link.icon} class="h-3.5 w-3.5" />
                            {link.label}
                        </a>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</aside>
