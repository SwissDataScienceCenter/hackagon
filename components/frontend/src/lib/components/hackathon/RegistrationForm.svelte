<script lang="ts">
    import type { ComponentProps, Snippet } from 'svelte';
    import QuestionField from '$lib/components/hackathon/QuestionField.svelte';
    import { checkForm } from '$lib/utils/formValidation';
    import { answerFieldName } from '$lib/utils/question';

    let {
        questions,
        values,
        actions,
    }: {
        questions: ComponentProps<typeof QuestionField>['question'][];
        /** Answers already on file, keyed by question id, so the form opens filled in. */
        values: Record<string, string | boolean>;
        /** The submit and cancel controls, which differ between the pages using this. */
        actions: Snippet;
    } = $props();

    const hasMandatory = $derived(questions.some((q) => q.mandatory));

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

<!--
  A hackathon's registration questions as a form, posting to the page's default
  action. Two pages use it: /register/[id], for signing up and for answering from
  the waiting list, and the in-hackathon answers page under your own profile,
  for a confirmed member. Each page keeps its own heading and its own buttons;
  the questions, their checks and the "Required" note are the same on both.
-->
<form
    method="POST"
    class="flex flex-col gap-5"
    use:ownMessages
    onsubmit={check}
    oninput={clearAnswered}
>
    <section class="card flex flex-col gap-5 px-5 py-4">
        {#each questions as question (question.id)}
            <QuestionField
                {question}
                value={values[question.id]}
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
        {@render actions()}
    </div>
</form>
