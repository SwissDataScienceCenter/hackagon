<script lang="ts" generics="T">
    import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-svelte';
    import type { Snippet } from 'svelte';
    import type { Column } from '$lib/utils/dataView';

    let {
        columns,
        rows,
        rowKey,
        row,
        empty = 'Nothing to show.',
        caption = '',
    }: {
        columns: Column<T>[];
        rows: T[];
        rowKey: (row: T) => string;
        /** Renders the <td>s for one row; the <tr> is provided. */
        row: Snippet<[T]>;
        empty?: string;
        caption?: string;
    } = $props();

    let sortKey = $state('');
    let descending = $state(false);

    function toggleSort(col: Column<T>) {
        if (!col.sort) return;
        if (sortKey === col.key) {
            descending = !descending;
        } else {
            sortKey = col.key;
            descending = false;
        }
    }

    const sorted = $derived.by(() => {
        const col = columns.find((c) => c.key === sortKey);
        if (!col?.sort) return rows;
        const accessor = col.sort;

        // Copy first: sorting the prop array in place mutates the caller's
        // data, which in a $derived chain re-triggers the very effect that
        // produced it.
        return [...rows].sort((a, b) => {
            const av = accessor(a);
            const bv = accessor(b);
            const cmp =
                typeof av === 'number' && typeof bv === 'number'
                    ? av - bv
                    : String(av).localeCompare(String(bv), undefined, { numeric: true });

            return descending ? -cmp : cmp;
        });
    });

    const alignClass = (a: Column<T>['align']) =>
        a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
</script>

{#if rows.length === 0}
    <p class="py-6 text-center text-sm text-surface-500">{empty}</p>
{:else}
    <!-- The table scrolls inside its own box: a wide row must never make the
         whole page scroll sideways on a phone. -->
    <div class="overflow-x-auto rounded border border-surface-200-800">
        <table class="w-full border-collapse text-sm">
            {#if caption}<caption class="sr-only">{caption}</caption>{/if}
            <thead class="bg-surface-100-900">
                <tr>
                    {#each columns as col (col.key)}
                        <th
                            scope="col"
                            class="px-3 py-2 font-semibold whitespace-nowrap {alignClass(col.align)} {col.class ??
                                ''}"
                            aria-sort={sortKey === col.key
                                ? descending
                                    ? 'descending'
                                    : 'ascending'
                                : undefined}
                        >
                            {#if col.sort}
                                <button
                                    type="button"
                                    class="inline-flex items-center gap-1 hover:text-primary-500"
                                    onclick={() => toggleSort(col)}
                                >
                                    {col.label}
                                    {#if sortKey !== col.key}
                                        <ChevronsUpDown class="h-3 w-3 opacity-40" aria-hidden="true" />
                                    {:else if descending}
                                        <ChevronDown class="h-3 w-3" aria-hidden="true" />
                                    {:else}
                                        <ChevronUp class="h-3 w-3" aria-hidden="true" />
                                    {/if}
                                </button>
                            {:else}
                                {col.label}
                            {/if}
                        </th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each sorted as r (rowKey(r))}
                    <tr class="border-t border-surface-200-800 hover:bg-surface-100-900">
                        {@render row(r)}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
