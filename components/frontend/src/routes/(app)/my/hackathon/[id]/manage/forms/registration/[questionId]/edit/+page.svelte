<script lang="ts">
    import QuestionRowForm from '$lib/components/hackathon/QuestionRowForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PageHeader` calls `resolve()` at its own anchor, and the form
    // takes the plain path for its Cancel.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/manage/forms/registration`);

    // What the organizer typed, when a save came back refused. Spread over the
    // stored question rather than replacing it, so `id` and `answerCount` stay the
    // server's facts: the count is what locks half these controls, and a form does
    // not get to claim it.
    const question = $derived(
        form?.values ? { ...data.question, ...form.values } : data.question
    );
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="Edit Question" back={{ href: backHref, label: 'Registration Form' }}>
        {#snippet meta()}
            <p class="m-0">
                Deleting this question is on the list behind you, not here: it would discard
                the answers this form is showing.
            </p>
        {/snippet}
    </PageHeader>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <section class="card flex flex-col gap-3 border-line-strong px-5 py-4">
        <QuestionRowForm
            {question}
            action="?/save"
            submitLabel="Save changes"
            cancelHref={backHref}
        />
    </section>
</div>
