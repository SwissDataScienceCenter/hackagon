<script lang="ts">
    import { Pencil, Plus, Trash2 } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import FormsManageTabs from '$lib/components/hackathon/FormsManageTabs.svelte';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import { questionKindLabel } from '$lib/utils/question';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).

  A list of what the event asks, and nothing on it is open. Each question used to
  render its own eight-field form here, plus a permanently-open blank one at the
  bottom — so a form with eight questions was nine open forms, and the fields of
  the one you meant to change were indistinguishable from the seven you did not.

  Adding is `./new`, changing is `./<id>/edit`: real addresses rather than a
  disclosure toggle, so the back button understands them, nothing needs
  JavaScript to open, and a refused save re-renders the form that was refused
  instead of collapsing the panel holding the error. Same split as Manage
  Timeline, Manage Voting and Manage Pages.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-title text-ink">Registration Form</h2>
            <p class="m-0 text-xs text-ink-3">
                What this event asks people when they sign up. Questions marked required
                have to be answered before someone can join, and answers are for
                organizers only unless you choose to show them to participants.
            </p>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/manage/forms/registration/new`)}
            class="btn btn-sm btn-solid no-underline"
        >
            <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
            New question
        </a>
    </div>

    <FormsManageTabs
        hackathonId={data.hackathonId}
        current="registration"
        questionCount={data.questions.length}
    />

    <!-- Only the delete posts to this page, so this reports only on a delete.
         A create or an edit reports on its own page and then redirects here. -->
    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {:else if form?.removed}
        <p class="m-0 text-xs text-success-ink" role="status">Question deleted.</p>
    {/if}

    {#if data.questions.length === 0}
        <section class="card flex flex-col gap-1 px-5 py-4">
            <span class="meta">No questions yet</span>
            <p class="m-0 text-sm text-ink-3">
                This event asks nothing at sign-up, so joining is a single click. Add a
                question to start collecting answers.
            </p>
        </section>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.questions as question (question.id)}
                <li class="card card-raised box-border w-full px-5 py-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <!-- Position, which is also the only way to reorder:
                                 there is no reorder RPC, so moving a question means
                                 editing this number. Showing it here is what makes
                                 that legible without opening anything. -->
                            <span class="tnum text-xs text-ink-3">
                                <span class="sr-only">Position</span>{question.order}
                            </span>
                            <h3 class="m-0 text-sm leading-snug text-ink">
                                {question.label}
                            </h3>
                            <span class="badge badge-neutral">
                                {questionKindLabel(question.kind)}
                            </span>
                            {#if question.mandatory}
                                <span class="badge badge-neutral">Required</span>
                            {/if}
                            <!-- Warning, not neutral: this is the one setting on a
                                 question that discloses something, and an organizer
                                 scanning the list should be able to see at a glance
                                 which answers the whole cohort can read. -->
                            {#if question.publicAnswers}
                                <span class="badge badge-warning">Shown to everyone</span>
                            {/if}

                            <div class="ml-auto flex items-center gap-3">
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/manage/forms/registration/${question.id}/edit`
                                    )}
                                    class="text-xs font-semibold text-accent-ink
                                           no-underline hover:underline"
                                >
                                    <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                    Edit<span class="sr-only"> {question.label}</span>
                                </a>

                                <!-- Its own form, and on the row rather than inside
                                     the edit page: a delete cannot ride along with
                                     the fields it would discard. -->
                                <form method="POST" action="?/remove">
                                    <input type="hidden" name="questionId" value={question.id} />
                                    <button
                                        type="submit"
                                        class="text-xs font-semibold text-danger-ink
                                               underline-offset-2 hover:underline"
                                    >
                                        <Trash2 class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                        Delete<span class="sr-only"> {question.label}</span>
                                    </button>
                                </form>
                            </div>
                        </div>

                        <!-- The key names the answers, so it is what a CSV export
                             uses as a column heading — worth reading off the list
                             rather than only inside the form. Not a badge: badges
                             are uppercased by the theme, and a key is lowercase. -->
                        <span class="font-mono text-xs text-ink-3">{question.key}</span>

                        {#if question.answerCount > 0}
                            <p class="m-0 text-xs text-ink-3">
                                {question.answerCount}
                                {question.answerCount === 1 ? 'person has' : 'people have'}
                                answered this, so its type, its options and whether it is
                                required are now fixed — and deleting it discards those
                                answers.
                            </p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
