<script lang="ts">
    import ProjectEditForm from '$lib/components/hackathon/ProjectEditForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `ProjectEditForm` and `PageHeader` call `resolve()` at their
    // own anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/projects/manage`);
</script>

<!--
  The organiser's create form. The same form the edit route uses, on an empty
  project — so the two cannot drift apart, and an organiser filling this in sees
  the fields they will later edit.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the manage list).
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="New Project" back={{ href: backHref, label: 'Manage Projects' }}>
        {#snippet meta()}
            <p class="m-0">
                It joins the queue awaiting review, like any proposal — approve it there and it
                appears on the participants' Projects page.
            </p>
        {/snippet}
    </PageHeader>

    <ProjectEditForm
        project={{ title: '', description: '', trackId: '', image: '' }}
        tracks={data.tracks}
        cancelHref={backHref}
        message={form?.message}
        submitLabel="Create project"
    />
</div>
