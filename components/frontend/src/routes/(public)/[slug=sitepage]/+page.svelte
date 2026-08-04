<script lang="ts">
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';

    const { data } = $props();
</script>

<svelte:head>
    <title>{data.page.title} · Hackagon</title>
</svelte:head>

<article class="mx-auto w-full max-w-4xl px-4 py-10 sm:px-10 md:px-20">
    <h1 class="text-2xl font-bold sm:text-3xl">{data.page.title}</h1>
    <!-- Content is markdown authored by admins; MarkdownSection parses and
         sanitizes it before it ever reaches the DOM. -->
    <MarkdownSection content={data.page.content} />
</article>
