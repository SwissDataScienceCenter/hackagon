<script lang="ts">
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import Seo from '$lib/components/layout/Seo.svelte';

    const { data } = $props();
</script>

<!-- Description from the page body: strip the markdown syntax first, or the
     preview card shows literal "##" and "[text](url)". -->
<Seo
    title={data.page.title}
    description={data.page.content
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_`~|-]/g, ' ')
        .trim() || undefined}
    type="article"
/>

<article class="mx-auto w-full max-w-4xl px-4 py-10 sm:px-10 md:px-20">
    <h1 class="text-2xl font-bold sm:text-3xl">{data.page.title}</h1>
    <!-- Content is markdown authored by admins; MarkdownSection parses and
         sanitizes it before it ever reaches the DOM. -->
    <MarkdownSection content={data.page.content} />
</article>
