<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-col gap-6 px-4 py-6 sm:px-10 md:px-20">
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
