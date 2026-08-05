<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
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

<article class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10 sm:px-10 md:px-20">
    <h1 class="m-0 text-title text-ink">{data.page.title}</h1>
    <!-- Content is markdown authored by admins. MarkdownContent parses and
         sanitises it (marked + DOMPurify) before it reaches the DOM — this is
         the one place on the public site where someone else's text becomes
         HTML, so it never goes through {@html} unguarded. -->
    <MarkdownContent content={data.page.content} />
</article>
