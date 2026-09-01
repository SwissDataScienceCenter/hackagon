<script lang="ts">
    import { resolve } from '$app/paths';
    import QuestionField from '$lib/components/hackathon/QuestionField.svelte';
    import { checkForm } from '$lib/utils/formValidation';
    import { answerFieldName } from '$lib/utils/question';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const hasMandatory = $derived(data.questions.some((q) => q.mandatory));

    /** What is wrong with each answer, keyed by form field name. */
    let errors = $state<Record<string, string>>({});

    // `novalidate` from here rather than in the markup, because the two ways of
    // spelling it are not equivalent. In the markup it would also apply with the
    // page's JavaScript never having run, and then nothing at all would check the
    // form before the round trip. Set from an action, it is switched on exactly
    // when the code below is there to take over — so a visitor without JS keeps
    // the browser's tooltip, which is ugly but present, and everybody else gets
    // the message in the app's own type. Either way the backend checks again.
    function ownMessages(node: HTMLFormElement) {
        node.noValidate = true;
    }

    function check(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
        const { messages, first } = checkForm(event.currentTarget);
        errors = messages;
        if (!first) return;

        event.preventDefault();
        // Focus, not scroll: the message sits inside the field's own label, so
        // landing on the control is what reads it out.
        first.focus();
    }

    // Answering clears that one message, so a corrected field stops complaining
    // straight away instead of waiting for the next submit. `input` covers all
    // three kinds — typing, picking from the list, ticking the box.
    function clearAnswered(event: Event) {
        const { name } = event.target as HTMLElement & { name?: string };
        if (name && name in errors) delete errors[name];
    }
</script>

<div class="flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-10">
    <div class="flex flex-col gap-1">
        <a
            href={resolve('/dashboard')}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to dashboard
        </a>
        <h1 class="m-0 text-title text-ink">
            {data.isMember ? 'Your registration' : `Register for ${data.name}`}
        </h1>
        <p class="m-0 text-xs text-ink-3">
            {#if data.isMember}
                Your answers for {data.name}. You can change them at any time.
            {:else}
                {data.name} asks a few questions before you join.
            {/if}
        </p>
    </div>

    {#if data.isWaiting}
        <!-- TODO(backend: waitlisted-answers): saying they cannot change them is
             the truth today, not the intent. `SubmitAnswers` needs
             `hackathon:read`, and the role carrying it is granted on approval
             rather than on joining — so the waiting list is exactly where
             editing stops working. Restore "you can still change them" once the
             gate moves to the participant row. -->
        <p class="m-0 text-xs text-ink-3">
            You are on the waiting list. Your answers are what the organizers read
            when they review it; they cannot be changed until you are approved.
        </p>
    {/if}

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {:else if form?.saved}
        <p class="m-0 text-xs text-success-ink" role="status">Answers saved.</p>
    {/if}

    {#if data.questions.length === 0}
        <section class="card flex flex-col gap-3 px-5 py-4">
            <p class="m-0 text-sm text-ink-3">
                This hackathon asks nothing at sign-up.
            </p>
            {#if !data.isMember}
                <!-- Nothing to answer, so the form is the join. Posting the empty
                     form is exactly what the dashboard button would have done. -->
                <form method="POST">
                    <button type="submit" class="btn btn-sm btn-solid">
                        Join {data.name}
                    </button>
                </form>
            {/if}
        </section>
    {:else}
        <form
            method="POST"
            class="flex flex-col gap-5"
            use:ownMessages
            onsubmit={check}
            oninput={clearAnswered}
        >
            <section class="card flex flex-col gap-5 px-5 py-4">
                {#each data.questions as question (question.id)}
                    <QuestionField
                        {question}
                        value={data.values[question.id]}
                        error={errors[answerFieldName(question.id)]}
                    />
                {/each}
            </section>

            {#if hasMandatory}
                <p class="m-0 text-meta text-ink-3">
                    <span class="text-danger-ink" aria-hidden="true">*</span>
                    Required.
                </p>
            {/if}

            <div class="flex gap-2">
                <button type="submit" class="btn btn-sm btn-solid">
                    {data.isMember ? 'Save answers' : `Join ${data.name}`}
                </button>
                <a href={resolve('/dashboard')} class="btn btn-sm btn-ghost no-underline">
                    Cancel
                </a>
            </div>
        </form>
    {/if}
</div>
