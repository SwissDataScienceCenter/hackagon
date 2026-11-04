<script lang="ts">
    import PhaseForm from '$lib/components/hackathon/PhaseForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PhaseForm` and `PageHeader` call `resolve()` at their own
    // anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/timeline/manage`);

    const blank = {
        name: '',
        description: '',
        startsAt: undefined,
        endsAt: undefined,
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="New Phase" back={{ href: backHref, label: 'Manage Timeline' }}>
        {#snippet meta()}
            <p class="m-0">
                Participants see the phase as soon as it is saved, and the next step is
                scheduling it — this form hands straight over to it. Undated phases sort to
                the top of the timeline until they are scheduled.
            </p>
        {/snippet}
    </PageHeader>

    <PhaseForm
        phase={blank}
        cancelHref={backHref}
        submitLabel="Add phase"
        message={form?.message}
        datesEditable={false}
    />
</div>
