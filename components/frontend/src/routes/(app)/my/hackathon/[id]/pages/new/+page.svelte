<script lang="ts">
    import PageForm from '$lib/components/hackathon/PageForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PageForm` and `PageHeader` call `resolve()` at their own
    // anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/pages`);

    const blank = {
        title: '',
        content: '',
        visible: true,
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="New Page" back={{ href: backHref, label: 'Manage Pages' }}>
        {#snippet meta()}
            <p class="m-0">
                Visible pages appear in the sidebar for every participant as soon as they're
                saved.
            </p>
        {/snippet}
    </PageHeader>

    <PageForm page={blank} cancelHref={backHref} submitLabel="Add page" message={form?.message} />
</div>
