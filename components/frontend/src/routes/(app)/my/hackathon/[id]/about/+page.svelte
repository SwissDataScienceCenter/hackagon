<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import StoredImage from '$lib/components/hackathon/StoredImage.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!--
  The hackathon's picture is shown here and, among the member pages, only here.
  The layout draws its hero on /overview alone (see `showHero`), deliberately:
  repeating the hackathon's identity above Participants or Teams pushes someone's
  actual errand down the screen. About is the exception that rule was always
  going to need — it is the one member page whose subject *is* the hackathon.

  Drawn by `StoredImage`, which is also what the public page and the
  organiser's preview of it use. An organiser pastes one URL and sees one
  picture, whatever shape it turned out to be.

  Capped at max-w-3xl to share the description's measure below it, so the two
  line up on one left edge rather than the picture overhanging the prose.
-->
<div class="flex flex-col gap-6 px-4 py-6 sm:px-10 md:px-20">
    <!-- Decorative: the hackathon's name is the very next element, so alt text
         here would have a screen reader say it twice. -->
    <StoredImage src={data.logo} maxHeight="max-h-64" class="max-w-3xl" />

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
