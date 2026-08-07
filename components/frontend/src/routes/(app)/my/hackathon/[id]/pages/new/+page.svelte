<script lang="ts">
    import { resolve } from '$app/paths';
    import PageForm from '$lib/components/hackathon/PageForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PageForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/pages`);

    const blank = {
        title: '',
        content: '',
        visible: true,
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/pages`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to pages
        </a>
        <h1 class="m-0 text-lg font-bold text-surface-950-50">New Page</h1>
        <p class="m-0 text-xs text-surface-500">
            Visible pages appear in the sidebar for every participant as soon as they're
            saved.
        </p>
    </div>

    <PageForm uploadEndpoint={`/my/hackathon/${data.hackathonId}/media`} page={blank} cancelHref={backHref} submitLabel="Add page" message={form?.message} />
</div>
