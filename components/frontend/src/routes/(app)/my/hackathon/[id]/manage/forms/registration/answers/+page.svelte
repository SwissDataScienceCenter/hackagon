<script lang="ts">
    import { resolve } from '$app/paths';
    import AnswerText from '$lib/components/hackathon/AnswerText.svelte';
    import { questionKindLabel } from '$lib/utils/question';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const people = $derived(
        data.rosterSize === 1 ? '1 participant' : `${data.rosterSize} participants`
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).

  What the registration form collected, all of it on one page. The builder next
  door briefly carried a tally on each row, which answered "how did the t-shirt
  sizes fall out" and nothing at all about the free-text questions — where the
  answers are the whole point and there had been nowhere to read them but the CSV
  export.

  Organizer-only, like the builder: this shows every answer, including the ones
  to questions the event chose not to share with participants.

  Where a question has a tally it leads, and the names fold away underneath —
  for a tick-box the split *is* the answer and who said what is the follow-up.
  Free text has no tally and its answers stay open, because a results page that
  hides the thing you came to read is a page with nothing on it.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/manage/forms/registration`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Registration Form
        </a>
        <h2 class="m-0 text-title text-ink">Registration Answers</h2>
        <p class="m-0 text-xs text-ink-3">
            What {people} said when they signed up. Organizers only — this includes the
            answers to questions you have not shared with participants.
        </p>
    </div>

    {#if data.questions.length === 0}
        <section class="card flex flex-col gap-2 px-5 py-4">
            <span class="meta">Nothing to report</span>
            <p class="m-0 text-sm text-ink-3">
                This event asks nothing at sign-up, so there is nothing to answer.
            </p>
            <a
                href={resolve(
                    `/my/hackathon/${data.hackathonId}/manage/forms/registration/new`
                )}
                class="btn btn-sm btn-outline w-fit no-underline"
            >
                Add a question
            </a>
        </section>
    {:else}
        {#each data.questions as question (question.id)}
            <section class="card flex flex-col gap-3 px-5 py-4">
                <div class="flex flex-col gap-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="m-0 text-section text-ink">{question.label}</h3>
                        <span class="badge badge-neutral">
                            {questionKindLabel(question.kind)}
                        </span>
                        {#if question.mandatory}
                            <span class="badge badge-neutral">Required</span>
                        {/if}
                        {#if question.publicAnswers}
                            <span class="badge badge-warning">Shown to everyone</span>
                        {/if}
                    </div>
                    <span class="font-mono text-xs text-ink-3">{question.key}</span>
                    <!-- The denominator is the roster, so this says who is still
                         to answer rather than only how many did. A question added
                         after people joined reads as mostly missing, which is the
                         honest shape of it: nobody was ever asked. -->
                    <span class="tnum text-xs text-ink-3">
                        {question.answers.length}
                        answered{#if question.missing > 0}
                            &middot; {question.missing} did not{/if}
                    </span>
                </div>

                {#if question.tally}
                    <div class="flex flex-wrap items-center gap-1">
                        {#each question.tally as bucket (bucket.label)}
                            <span class="tally {bucket.count === 0 ? 'opacity-60' : ''}">
                                {bucket.label}
                                <span class="tnum font-semibold text-ink">{bucket.count}</span>
                            </span>
                        {/each}
                    </div>
                {/if}

                {#if question.answers.length === 0}
                    <p class="m-0 text-sm text-ink-3">Nobody has answered this yet.</p>
                {:else if question.tally}
                    <!-- Folded: the tally above is the answer, and who chose what is
                         the follow-up question. Native `<details>`, so it needs no
                         JavaScript and the browser owns the keyboard behaviour. -->
                    <details class="border-t border-line pt-3">
                        <summary class="cursor-pointer text-xs text-ink-3 select-none
                                        hover:text-ink-2">
                            Who said what
                        </summary>
                        <ul class="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
                            {#each question.answers as answer (answer.participantId)}
                                <li class="flex flex-wrap items-baseline gap-x-2 text-sm">
                                    <span class="text-ink-2 {answer.departed ? 'italic' : ''}">
                                        {answer.name}
                                    </span>
                                    <span class="min-w-0 break-words text-ink">
                                        <AnswerText value={answer.value} />
                                    </span>
                                </li>
                            {/each}
                        </ul>
                    </details>
                {:else}
                    <!-- Open: free text has no tally, so this is the whole content
                         of the question and the reason to be on this page. -->
                    <ul class="m-0 flex list-none flex-col gap-2 p-0">
                        {#each question.answers as answer (answer.participantId)}
                            <li class="flex flex-col gap-0.5 border-t border-line pt-2">
                                <span class="text-xs text-ink-3 {answer.departed
                                    ? 'italic'
                                    : ''}">
                                    {answer.name}
                                </span>
                                <!-- `.prose` is for running text, and a free-text
                                     answer is a sentence somebody wrote. Wrapped so a
                                     pasted paragraph does not stretch the card. -->
                                <p class="prose m-0 text-sm break-words text-ink">
                                    <AnswerText value={answer.value} />
                                </p>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/each}
    {/if}
</div>
