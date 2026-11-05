<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { avatarInitials } from '$lib/utils/initials';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!--
  The hackathon's identity page. The layout draws the hero — picture, name,
  dates, chips — and the phase bar above this, on /about alone (see `showHero`),
  so this page holds only what the hero cannot: who runs it, and the organiser's
  own words.

  Capped at max-w-3xl, a reading measure for prose.
-->
<div class="flex flex-col gap-6 px-4 py-6 sm:px-10 md:px-20">
    {#if data.ownerNames.length > 0}
        <!-- Who to turn to. A byline rather than cards: small initials, since a
             user carries no picture, and the full-size avatar the participant
             and team cards use would outweigh the description below it. -->
        <section class="flex flex-col gap-2" aria-labelledby="organized-by">
            <h2 class="meta m-0" id="organized-by">Organized by</h2>
            <ul class="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
                {#each data.ownerNames as name, i (i)}
                    <li class="flex items-center gap-2">
                        <span
                            class="flex size-8 shrink-0 items-center justify-center rounded-full
                                   bg-raised text-xs font-semibold text-ink-2"
                            aria-hidden="true">{avatarInitials(name)}</span
                        >
                        <span class="text-sm text-ink">{name}</span>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

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
