<script lang="ts">
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hasAnything = $derived(data.sessions.length > 0 || data.otherPages.length > 0);

    function updated(d: Date | string | null): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }
</script>

{#snippet pageEntry(p: PageData['sessions'][number])}
    <article class="flex flex-col gap-1 border border-surface-200-800 bg-surface-100-900 p-5">
        <h3 class="m-0 text-sm font-bold text-surface-950-50">{p.title}</h3>
        {#if updated(p.updatedAt)}
            <span class="text-xs text-surface-500">Updated {updated(p.updatedAt)}</span>
        {/if}
        <div class="prose-box min-w-0 break-words">
            <MarkdownSection content={p.content} />
        </div>
    </article>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Webinars</h2>
        <!--
          Honest framing rather than a fabricated line-up: the platform has no
          webinar, session or speaker entity. Organizers announce sessions and
          link their recordings as event pages, so those pages are what this
          tab shows — as published, nothing added.
        -->
        <p class="m-0 max-w-2xl text-xs text-surface-500">
            Hackagon has no separate sessions feature. Organizers announce webinars — and
            link their recordings — as event pages, shown here exactly as published.
        </p>
    </div>

    {#if !hasAnything}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            Nothing published yet. Webinar announcements and recording links will appear
            here once the organizers publish them; the event schedule lives on the Timeline
            tab.
        </p>
    {:else}
        {#if data.sessions.length > 0}
            <section class="flex flex-col gap-4">
                {#each data.sessions as p (p.id)}
                    {@render pageEntry(p)}
                {/each}
            </section>
        {:else}
            <p class="m-0 text-sm text-surface-500">
                No session pages yet. The organizers have published other event pages,
                listed below.
            </p>
        {/if}

        {#if data.otherPages.length > 0}
            <!--
              Nothing published is hidden: pages whose titles do not read like
              session announcements stay reachable here, collapsed, instead of
              being filtered out of the member's view entirely.
            -->
            <details class="border border-surface-200-800 bg-surface-50-950 p-4">
                <summary class="cursor-pointer text-xs font-bold text-surface-700-300">
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
      MarkdownSection owns the sanitizing renderer and the prose styles, but it
      also ships full-bleed page padding (px-4 … md:px-20) meant for a
      standalone page. Zeroing it lets the same renderer sit inside a card.
      `break-words` on the wrapper is inherited, so the long recording URLs
      organizers paste cannot push the phone layout sideways.
    */
    .prose-box :global(section) {
        padding: 0.25rem 0;
    }
</style>
