<script lang="ts">
    import TrackForm from '$lib/components/hackathon/TrackForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `TrackForm` and `PageHeader` call `resolve()` at their own
    // anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/tracks`);

    const blank = { name: '', description: '' };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="New Track" back={{ href: backHref, label: 'Manage Tracks' }}>
        {#snippet meta()}Participants can pick it when proposing or editing a project.{/snippet}
    </PageHeader>

    <TrackForm track={blank} cancelHref={backHref} submitLabel="Create track" message={form?.message} />
</div>
