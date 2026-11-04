<script lang="ts">
    import QuestionRowForm from '$lib/components/hackathon/QuestionRowForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { QuestionKind } from '$lib/utils/question';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PageHeader` calls `resolve()` at its own anchor, and the form
    // takes the plain path for its Cancel. Same shape as the voting category form.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/manage/forms/registration`);

    const blank = $derived({
        key: '',
        label: '',
        kind: 'text' as QuestionKind,
        mandatory: false,
        order: data.nextOrder,
        options: [] as string[],
        publicAnswers: false,
        answerCount: 0
    });

    // What the organizer typed, when a save came back refused. Spread over the
    // blank rather than replacing it so `answerCount` stays the server's fact — a
    // question that does not exist yet has no answers, whatever a form claims.
    const question = $derived(form?.values ? { ...blank, ...form.values } : blank);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="New Question" back={{ href: backHref, label: 'Registration Form' }}>
        {#snippet meta()}
            <p class="m-0">
                One question on the sign-up form. Its key names the answers and cannot be
                changed afterwards, so it is the one field worth pausing over.
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
            submitLabel="Add question"
            cancelHref={backHref}
            keyEditable
        />
    </section>
</div>
