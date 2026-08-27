<script lang="ts">
    import { resolve } from '$app/paths';
    import QuestionRowForm from '$lib/components/hackathon/QuestionRowForm.svelte';
    import type { QuestionKind } from '$lib/utils/question';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `resolve()` wants a route literal, so the back link resolves one
    // inline and the form takes the plain path for its Cancel. Same shape as the
    // voting category form.
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
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/manage/forms/registration`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Registration Form
        </a>
        <h2 class="m-0 text-title text-ink">New Question</h2>
        <p class="m-0 text-xs text-ink-3">
            One question on the sign-up form. Its key names the answers and cannot be
            changed afterwards, so it is the one field worth pausing over.
        </p>
    </div>

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
