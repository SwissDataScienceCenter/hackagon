<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!--
  The hackathon's identity page. The layout draws the hero — picture, name,
  dates, chips — and the phase bar above this, on /about alone (see `showHero`),
  so this page holds only what the hero cannot: the organiser's own words.

  Capped at max-w-3xl, a reading measure for prose.
-->
<div class="flex flex-col gap-6 px-4 py-6 sm:px-10 md:px-20">
    {#if data.description}
        <!-- Through the same component the organiser's editor previews with, so
             what they wrote is what a member reads. -->
        <div class="max-w-3xl">
            <MarkdownContent content={data.description} />
        </div>
    {:else}
        <!-- The entry is offered either way, because the hero above is worth the
             trip on its own. Said plainly, so an empty space under it does not
             read as something that failed to load. -->
        <p class="text-sm text-ink-3">
            The organizers have not written a description for this hackathon yet.
        </p>
    {/if}
</div>
