<script lang="ts">
    import { Search, LayoutGrid, Table as TableIcon } from 'lucide-svelte';
    import {
        loadViewMode,
        saveViewMode,
        type FilterDef,
        type ViewMode,
    } from '$lib/utils/dataView';

    let {
        search = $bindable(''),
        placeholder = 'Search…',
        view = $bindable<ViewMode>('cards'),
        /** Set to remember the chosen view per list; omit for a one-off. */
        viewKey = '',
        filters = [],
        filterValues = $bindable<Record<string, string>>({}),
        summary = '',
        shown = -1,
        total = -1,
    }: {
        search?: string;
        placeholder?: string;
        view?: ViewMode;
        viewKey?: string;
        filters?: FilterDef[];
        filterValues?: Record<string, string>;
        summary?: string;
        shown?: number;
        total?: number;
    } = $props();

    // Searching, filtering and the view toggle are all client-side by nature —
    // they re-render a list the server already sent whole. So they do nothing
    // until this component hydrates, and an interaction that lands earlier is
    // lost (Svelte applies its own state over the DOM when the bindings
    // attach). The window is short, but it is why anything driving these
    // controls in a test has to wait for the page to settle first.

    // The stored preference is read on mount, not during SSR: the server has no
    // localStorage, and rendering one view then swapping would flash.
    $effect(() => {
        if (viewKey) view = loadViewMode(viewKey, view);
    });

    function setView(mode: ViewMode) {
        view = mode;
        if (viewKey) saveViewMode(viewKey, mode);
    }

    const filtering = $derived(
        search.trim() !== '' || Object.values(filterValues).some((v) => v !== ''),
    );

    function clearAll() {
        search = '';
        filterValues = Object.fromEntries(Object.keys(filterValues).map((k) => [k, '']));
    }
</script>

<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
    <div class="flex min-w-0 flex-col gap-1">
        {#if summary}
            <span class="text-xs text-surface-500">{summary}</span>
        {/if}
        <!-- "17 of 240" is the bit that tells you a filter is hiding things;
             without it an empty-looking list reads as missing data. -->
        {#if filtering && shown >= 0 && total >= 0}
            <span class="text-xs text-surface-500">
                Showing {shown} of {total}
                <button class="ml-1 underline hover:text-primary-500" onclick={clearAll}>
                    clear
                </button>
            </span>
        {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400"
                aria-hidden="true"
            />
            <input
                type="search"
                bind:value={search}
                {placeholder}
                aria-label={placeholder}
                class="input h-9 w-full pl-9 text-sm"
            />
        </div>

        {#each filters as f (f.id)}
            <label class="flex items-center gap-1.5">
                <span class="sr-only">{f.label}</span>
                <select
                    class="select h-9 w-auto text-sm"
                    aria-label={f.label}
                    bind:value={filterValues[f.id]}
                >
                    <option value="">{f.label}: all</option>
                    {#each f.options as o (o.value)}
                        <option value={o.value}>{o.label}</option>
                    {/each}
                </select>
            </label>
        {/each}

        <!-- Two buttons rather than one toggle: the current view is visible at
             a glance instead of having to infer it from the icon shown. -->
        <div
            class="flex shrink-0 overflow-hidden rounded border border-surface-200-800"
            role="group"
            aria-label="View mode"
        >
            <button
                type="button"
                onclick={() => setView('cards')}
                aria-pressed={view === 'cards'}
                title="Card view"
                class="flex h-9 w-9 items-center justify-center
                       {view === 'cards' ? 'bg-primary-500 text-white' : 'hover:bg-surface-100-900'}"
            >
                <LayoutGrid class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Card view</span>
            </button>
            <button
                type="button"
                onclick={() => setView('table')}
                aria-pressed={view === 'table'}
                title="Table view"
                class="flex h-9 w-9 items-center justify-center
                       {view === 'table' ? 'bg-primary-500 text-white' : 'hover:bg-surface-100-900'}"
            >
                <TableIcon class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Table view</span>
            </button>
        </div>
    </div>
</div>
