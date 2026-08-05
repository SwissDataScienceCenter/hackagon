<script lang="ts">
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hasAnything = $derived(data.galleries.length > 0 || data.otherPages.length > 0);

    function updated(d: Date | string | null): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }
</script>

{#snippet pageEntry(p: PageData['galleries'][number])}
    <article class="flex flex-col gap-1 border border-line bg-raised p-5">
        <h3 class="m-0 text-sm font-bold text-ink">{p.title}</h3>
        {#if updated(p.updatedAt)}
            <span class="text-xs text-ink-3">Updated {updated(p.updatedAt)}</span>
        {/if}
        <div class="prose-box min-w-0 break-words">
            <MarkdownSection content={p.content} />
        </div>
    </article>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-ink">Photos</h2>
        <!--
          No fabricated gallery: the platform stores no images. Media is
          links-first until blob storage lands, so a gallery is an event page
          the organizers publish with links to wherever the photos live.
        -->
        <p class="m-0 max-w-2xl text-xs text-ink-3">
            Hackagon has no photo upload — event galleries are published as event pages
            linking to wherever the photos live. Those pages are shown here as published.
        </p>
    </div>

    {#if !hasAnything}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Nothing published yet. When the organizers publish a gallery page, it appears
            here.
        </p>
    {:else}
        {#if data.galleries.length > 0}
            <section class="flex flex-col gap-4">
                {#each data.galleries as p (p.id)}
                    {@render pageEntry(p)}
                {/each}
            </section>
        {:else}
            <p class="m-0 text-sm text-ink-3">
                No gallery page yet. The organizers have published other event pages,
                listed below.
            </p>
        {/if}

        {#if data.otherPages.length > 0}
            <!-- Nothing published is hidden; see ../webinars. -->
            <details class="border border-line bg-surface p-4">
                <summary class="cursor-pointer text-xs font-bold text-ink-2">
                    Other pages published by the organizers ({data.otherPages.length})
                </summary>
                <div class="mt-4 flex flex-col gap-4">
                    {#each data.otherPages as p (p.id)}
                        {@render pageEntry(p)}
                    {/each}
                </div>
            </details>
        {/if}
    {/if}
</div>

<style>
    /*
      See ../webinars: MarkdownSection's standalone-page padding is zeroed so
      the shared sanitizing renderer can sit inside a card. Any <img> the
      organizers embed is already capped at max-width:100% by MarkdownSection,
      and the inherited `break-words` keeps long photo URLs from widening the
      phone layout.
    */
    .prose-box :global(section) {
        padding: 0.25rem 0;
    }
</style>
