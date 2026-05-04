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

    const adminLinks: { icon: Component; label: string; href: string }[] = [
        { icon: PlusCircle, label: 'Create Hackathon', href: '/hackathon/create' },
        { icon: BarChart3, label: 'Admin Dashboard', href: '/admin' },
    ];
</script>

<aside class="flex w-full max-w-full shrink-0 flex-col gap-4 lg:w-72">
    <div class="card preset-outlined-surface-200-800 overflow-hidden">
        <div class="flex flex-col gap-2 p-4">
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={primaryActionHref} class="btn btn-sm preset-filled-primary-500 w-full no-underline">
                <ListOrdered class="h-3.5 w-3.5" />
                {primaryAction}
            </a>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={secondaryActionHref} class="btn btn-sm preset-tonal-surface w-full no-underline">
                <FilePlus class="h-3.5 w-3.5" />
                {secondaryAction}
            </a>
            <span class="text-center text-xs text-warning-500">{deadline}</span>
        </div>

        <div class="border-t border-surface-200-800 p-4">
            <span class="text-xs font-bold tracking-widest text-surface-500">YOUR TEAM</span>
            <p class="mt-1.5 text-sm font-semibold">{teamName}</p>
            <div class="mt-2 flex -space-x-1.5">
                {#each Array.from({ length: teamMemberCount }, (_, i) => i) as i (i)}
                    <div class="h-6 w-6 rounded-full bg-surface-200-800 ring-2 ring-surface-50-950"></div>
                {/each}
            </div>
            <a href="#team" class="mt-2 block text-xs text-primary-700-300 no-underline hover:underline">
                View Team Page →
            </a>
        </div>
    </div>

    <div class="card preset-outlined-surface-200-800 overflow-hidden p-4">
        <div class="flex flex-col gap-0.5">
            {#each navLinks as link (link.label)}
                {@const Icon = link.icon}
                <a href="#" class="flex h-7 items-center gap-2 text-xs text-surface-500 no-underline transition-colors hover:text-primary-500">
                    <Icon class="h-3.5 w-3.5" />
                    {link.label}
                </a>
            {/each}
        </div>

        {#if isAdmin}
            <div class="mt-3 border-t border-surface-200-800 pt-3">
                <span class="text-xs font-bold tracking-widest text-surface-500">ADMIN</span>
                <div class="mt-1 flex flex-col gap-0.5">
                    {#each adminLinks as link (link.label)}
                        {@const Icon = link.icon}
                        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                        <a href={link.href} class="flex h-7 items-center gap-2 text-xs text-surface-500 no-underline transition-colors hover:text-primary-500">
                            <Icon class="h-3.5 w-3.5" />
                            {link.label}
                        </a>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</aside>
