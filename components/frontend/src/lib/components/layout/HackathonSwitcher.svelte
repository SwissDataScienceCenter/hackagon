<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import ChevronDown from 'lucide-svelte/icons/chevron-down';
    import LayoutGrid from 'lucide-svelte/icons/layout-grid';
    import { membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonEntry {
        id: string;
        name: string;
        viewerMembership?: HackathonMember;
    }

    let { hackathons, collapsed }: { hackathons: HackathonEntry[]; collapsed: boolean } = $props();

    const GRADIENTS = [
        { from: 'var(--color-primary-700)', to: 'var(--color-primary-950)' },
        { from: 'var(--color-secondary-500)', to: 'var(--color-secondary-950)' },
        { from: 'var(--color-tertiary-500)', to: 'var(--color-tertiary-950)' },
    ];
    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length]!;
    }

    let open = $state(false);

    const activeId = $derived($page.params.slug);
    const active = $derived(hackathons.find((h) => h.id === activeId));

    $effect(() => {
        $page.url.pathname;
        open = false;
    });
</script>

<div class="relative p-2">
    <button
        onclick={() => (open = !open)}
        aria-label="Switch hackathon"
        aria-expanded={open}
        class="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-surface-100-900
               {collapsed ? 'justify-center' : 'justify-between'}"
    >
        <div class="flex min-w-0 items-center gap-2">
            {#if active}
                {@const i = hackathons.indexOf(active)}
                <div
                    class="h-6 w-6 shrink-0 rounded"
                    style="background: linear-gradient(135deg, {gradient(i).from}, {gradient(i).to})"
                ></div>
            {:else}
                <div
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-200-800"
                >
                    <LayoutGrid class="h-3.5 w-3.5" />
                </div>
            {/if}
            {#if !collapsed}
                <div class="min-w-0">
                    <div class="truncate text-sm font-semibold">
                        {active ? active.name : 'My Hackathons'}
                    </div>
                    {#if active?.viewerMembership}
                        <div class="text-xs text-surface-500">
                            {membershipBadgeLabel(
                                active.viewerMembership.isWaiting,
                                active.viewerMembership.role,
                            )}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
        {#if !collapsed}
            <ChevronDown class="h-4 w-4 shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
        {/if}
    </button>

    {#if open}
        <button
            aria-label="Close hackathon switcher"
            class="fixed inset-0 z-40"
            onclick={() => (open = false)}
        ></button>
        <div
            class="absolute left-2 top-full z-50 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg
                   border border-surface-200-800 bg-surface-50-950 py-1 shadow-lg"
        >
            {#each hackathons as h, i (h.id)}
                <a
                    href={resolve(`/hackathon/${h.id}/overview`)}
                    class="flex items-center gap-2 px-3 py-2 text-sm no-underline hover:bg-surface-100-900
                           {h.id === activeId ? 'bg-surface-100-900' : ''}"
                >
                    <div
                        class="h-6 w-6 shrink-0 rounded"
                        style="background: linear-gradient(135deg, {gradient(i).from}, {gradient(i).to})"
                    ></div>
                    <span class="min-w-0 flex-1 truncate">{h.name}</span>
                    {#if h.viewerMembership}
                        <span class="badge shrink-0 {membershipBadgePreset(h.viewerMembership.isWaiting)}">
                            {membershipBadgeLabel(h.viewerMembership.isWaiting, h.viewerMembership.role)}
                        </span>
                    {/if}
                </a>
            {/each}
            <a
                href={resolve('/(app)/(member)/dashboard')}
                class="flex items-center gap-2 border-t border-surface-200-800 px-3 py-2 text-sm
                       font-medium no-underline hover:bg-surface-100-900"
            >
                <LayoutGrid class="h-4 w-4 shrink-0" />
                All hackathons
            </a>
        </div>
    {/if}
</div>
