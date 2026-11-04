<script lang="ts">
    import VoteCategoryForm from '$lib/components/hackathon/VoteCategoryForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `VoteCategoryForm` and `PageHeader` call `resolve()` at their
    // own anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/voting/manage`);

    const blank = {
        name: '',
        description: '',
        votingMethod: 'single_choice',
        maxPoints: 0
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="New Voting Category" back={{ href: backHref, label: 'Manage Voting' }}>
        {#snippet meta()}Participants vote on submissions, one vote per category.{/snippet}
    </PageHeader>

    {#if data.resultsFinal}
        <p class="m-0 text-sm text-ink-2">
            The results of this voting round are final, so no more categories can be
            added.
        </p>
    {:else}
        <VoteCategoryForm
            category={blank}
            cancelHref={backHref}
            submitLabel="Create category"
            message={form?.message}
        />
    {/if}
</div>
