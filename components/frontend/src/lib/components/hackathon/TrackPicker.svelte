<script lang="ts" module>
    export interface TrackChoice {
        id: string;
        name: string;
        description: string;
    }
</script>

<script lang="ts">
    import { Modal } from '@skeletonlabs/skeleton-svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';

    let {
        name,
        tracks,
        value = $bindable('')
    }: {
        name: string;
        tracks: TrackChoice[];
        /** Track id, or '' for no track. */
        value?: string;
    } = $props();

    let open = $state(false);
    const selected = $derived(tracks.find((t) => t.id === value) ?? null);

    function choose(id: string) {
        value = id;
        open = false;
    }
</script>

<!--
  The hidden input lives outside the Modal on purpose: Skeleton portals the
  dialog to <body>, so any field rendered inside it is no longer part of the
  surrounding <form> and would never be submitted.
-->
<input type="hidden" {name} {value} />

<div class="flex flex-wrap items-center gap-2">
    <span class="text-sm font-normal text-surface-950-50">
        {selected ? selected.name : 'No track'}
    </span>
    <button
        type="button"
        class="btn btn-sm preset-tonal-surface rounded-none text-xs"
        onclick={() => (open = true)}
    >
        {selected ? 'Change track' : 'Choose a track'}
    </button>
    {#if selected}
        <button
            type="button"
            class="text-xs font-semibold text-surface-500 hover:underline"
            onclick={() => (value = '')}
        >
            Clear
        </button>
    {/if}
</div>

<Modal
    {open}
    onOpenChange={(e) => (open = e.open)}
    contentBase="card max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-none p-5"
    contentBackground="preset-outlined-surface-200-800 bg-surface-50-950"
>
    {#snippet content()}
        <div class="flex flex-col gap-4">
            <div class="flex items-start justify-between gap-4">
                <div class="flex flex-col gap-1">
                    <h3 class="m-0 text-base font-bold text-surface-950-50">Choose a track</h3>
                    <span class="text-xs text-surface-500">
                        Pick the track your project belongs to, or continue without one.
                    </span>
                </div>
                <button
                    type="button"
                    class="btn btn-sm preset-tonal-surface rounded-none text-xs"
                    onclick={() => (open = false)}
                >
                    Close
                </button>
            </div>

            <div class="flex flex-col gap-3">
                {#each tracks as t (t.id)}
                    <button
                        type="button"
                        onclick={() => choose(t.id)}
                        aria-pressed={value === t.id}
                        class="flex w-full flex-col items-start gap-1.5 border p-4 text-left transition-colors
                               {value === t.id
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-surface-200-800 bg-surface-100-900 hover:border-primary-500'}"
                    >
                        <span class="text-sm font-bold text-surface-950-50">{t.name}</span>
                        {#if t.description}
                            <div class="text-xs leading-relaxed text-surface-700-300">
                                <MarkdownContent content={t.description} />
                            </div>
                        {:else}
                            <span class="text-xs text-surface-500">No description provided.</span>
                        {/if}
                    </button>
                {/each}

                <button
                    type="button"
                    onclick={() => choose('')}
                    aria-pressed={value === ''}
                    class="flex w-full flex-col items-start gap-1.5 border p-4 text-left transition-colors
                           {value === ''
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-surface-200-800 bg-surface-100-900 hover:border-primary-500'}"
                >
                    <span class="text-sm font-bold text-surface-950-50">No track</span>
                    <span class="text-xs text-surface-500">
                        This project isn't tied to any track.
                    </span>
                </button>
            </div>
        </div>
    {/snippet}
</Modal>
