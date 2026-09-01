<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { usableImage } from '$lib/utils/imageUrl';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Same rule every surface drawing a stored address uses: a URL somebody
    // typed may serve a web page rather than bytes, and the broken-image glyph
    // reads as a fault in the app instead of a bad link. Recorded as *which*
    // address failed so a corrected one is tried afresh.
    let failedSrc: string | undefined = $state(undefined);
    const hasImage = $derived(usableImage(data.logo, failedSrc));
</script>

<!--
  The hackathon's picture is shown here and, among the member pages, only here.
  The layout draws its hero on /overview alone (see `showHero`), deliberately:
  repeating the hackathon's identity above Participants or Teams pushes someone's
  actual errand down the screen. About is the exception that rule was always
  going to need — it is the one member page whose subject *is* the hackathon.

  A bounded banner rather than the hero's treatment. In the hero the image is a
  backdrop with text over it, so it is dimmed to a wash to keep that text legible
  — on the public detail page to 9% of itself. Here nothing sits on top of it, so
  there is no contrast to protect and no reason to dim: this is the one place a
  reader can see what the organizers actually chose.

  Capped at max-w-3xl to share the description's measure below it, so the two
  line up on one left edge rather than the picture overhanging the prose.
-->
<div class="flex flex-col gap-6 px-4 py-6 sm:px-10 md:px-20">
    {#if hasImage}
        <!-- Decorative: the hackathon's name is the very next element, so alt
             text here would have a screen reader say it twice. -->
        <img
            src={data.logo}
            alt=""
            onerror={() => (failedSrc = data.logo)}
            class="aspect-[3/1] w-full max-w-3xl rounded-card border border-line
                   object-cover"
        />
    {/if}

    <h1 class="text-title">About {data.name}</h1>

    {#if data.description}
        <!-- Through the same component the organiser's editor previews with, so
             what they wrote is what a member reads. -->
        <div class="max-w-3xl">
            <MarkdownContent content={data.description} />
        </div>
    {:else}
        <!-- Reachable only by typing the URL: the sidebar withholds the entry
             when there is nothing here. Still answered plainly rather than with
             a 404, which would claim the hackathon does not exist. -->
        <p class="text-sm text-ink-3">
            The organizers have not written a description for this hackathon yet.
        </p>
    {/if}
</div>
