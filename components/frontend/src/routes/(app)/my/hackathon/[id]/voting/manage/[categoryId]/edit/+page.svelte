<script lang="ts">
    import VoteCategoryForm from '$lib/components/hackathon/VoteCategoryForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `VoteCategoryForm` and `PageHeader` call `resolve()` at their
    // own anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/voting/manage`);

    const initial = $derived({
        name: data.category.name,
        description: data.category.description,
        votingMethod: data.category.method,
        maxPoints: data.category.maxPoints
    });
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="Edit Voting Category" back={{ href: backHref, label: 'Manage Voting' }} />

    {#if data.resultsFinal && data.voters === 0}
        <p class="m-0 text-sm text-ink-2">
            <strong>{data.category.name}</strong> can no longer be changed: the results of
            this voting round are final.
        </p>
    {:else if data.voters > 0}
        <!-- Locked rather than editable with a warning: what people voted on has
             to stay what it was. Reached only by a direct link — the list
             offers no Edit for a category anyone has voted in. -->
        <p class="m-0 text-sm text-ink-2">
            <strong>{data.category.name}</strong> can no longer be changed:
            {data.voters === 1 ? '1 person has' : `${data.voters} people have`} voted in
            it, and what they voted on has to stay as it was.
        </p>
    {:else}
        <VoteCategoryForm
            category={initial}
            cancelHref={backHref}
            submitLabel="Save changes"
            message={form?.message}
        />
    {/if}
</div>
