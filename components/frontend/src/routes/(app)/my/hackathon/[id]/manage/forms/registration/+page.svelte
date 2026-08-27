<script lang="ts">
    import Trash2 from 'lucide-svelte/icons/trash-2';
    import FormsManageTabs from '$lib/components/hackathon/FormsManageTabs.svelte';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import QuestionRowForm from '$lib/components/hackathon/QuestionRowForm.svelte';
    import type { QuestionKind } from '$lib/utils/question';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // The blank row that creates the next question. Rebuilt whenever the list
    // changes so a successful create leaves an empty form rather than a copy of
    // what was just added, and so `position` keeps counting up.
    const blank = $derived({
        key: '',
        label: '',
        kind: 'text' as QuestionKind,
        mandatory: false,
        order: data.questions.length + 1,
        options: [] as string[],
        publicAnswers: false,
        answerCount: 0
    });

    const saved = $derived(form?.created || form?.edited || form?.removed);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <ManageHubBackLink hackathonId={data.hackathonId} />
        <h2 class="m-0 text-title text-ink">Registration Form</h2>
        <p class="m-0 text-xs text-ink-3">
            What this event asks people when they sign up. Questions marked required have
            to be answered before someone can join, and answers are for organizers only
            unless you choose to show them to participants.
        </p>
    </div>

    <FormsManageTabs
        hackathonId={data.hackathonId}
        current="registration"
        questionCount={data.questions.length}
    />

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {:else if saved}
        <p class="m-0 text-xs text-success-ink" role="status">Saved.</p>
    {/if}

    <!-- Existing questions, each its own form. There is no whole-form save: the
         API edits one question at a time, so a failure affects one row rather
         than the lot. -->
    {#if data.questions.length === 0}
        <section class="card flex flex-col gap-1 px-5 py-4">
            <span class="meta">No questions yet</span>
            <p class="m-0 text-sm text-ink-3">
                This event asks nothing at sign-up, so joining is a single click. Add a
                question below to start collecting answers.
            </p>
        </section>
    {:else}
        <section class="flex flex-col gap-3">
            <span class="meta">Questions</span>
            {#each data.questions as question (question.id)}
                <div class="card flex flex-col gap-3 px-5 py-4">
                    <QuestionRowForm {question} action="?/edit" submitLabel="Save changes" />

                    <!-- Its own form: a delete cannot ride along with the fields
                         it would discard. -->
                    <form method="POST" action="?/remove" class="border-t border-line pt-3">
                        <input type="hidden" name="questionId" value={question.id} />
                        <button type="submit" class="btn btn-sm btn-quiet text-danger-ink">
                            <Trash2 class="h-3 w-3 shrink-0" aria-hidden="true" />
                            Delete question
                        </button>
                        {#if question.answerCount > 0}
                            <span class="ml-2 text-xs text-ink-3">
                                Deleting it discards {question.answerCount} answer{question.answerCount ===
                                1
                                    ? ''
                                    : 's'}.
                            </span>
                        {/if}
                    </form>
                </div>
            {/each}
        </section>
    {/if}

    <section class="card flex flex-col gap-3 border-line-strong px-5 py-4">
        <span class="meta">Add a question</span>
        <QuestionRowForm
            question={blank}
            action="?/create"
            submitLabel="Add question"
            keyEditable
        />
    </section>
</div>
