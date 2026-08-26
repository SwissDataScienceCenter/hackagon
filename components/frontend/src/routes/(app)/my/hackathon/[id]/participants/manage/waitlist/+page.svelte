<script lang="ts">
    import { enhance } from '$app/forms';
    import { SvelteSet } from 'svelte/reactivity';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ParticipantsManageTabs from '$lib/components/hackathon/ParticipantsManageTabs.svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const pendingIds = new SvelteSet<string>();

    // Both actions on a row disable the pair while either is in flight, so one
    // handler serves them.
    const submitting = (id: string) => () => {
        pendingIds.add(id);
        return async ({ update }: { update: () => Promise<void> }) => {
            await update();
            pendingIds.delete(id);
        };
    };

    const initials = (name: string) =>
        name
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

    const applied = (at: Date | undefined) =>
        at
            ? at.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
              })
            : null;

    const countLabel = $derived(
        data.waiting.length === 1
            ? '1 person waiting'
            : `${data.waiting.length} people waiting`
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).

  The approval queue, and the one page that shows registration answers inline:
  deciding whether to let someone in *is* reading what they wrote. The roster tab
  beside it links to profiles instead, because a roster is a list you come back
  to and a hundred collapsed tables is not a list.

  Rows are built here rather than with ParticipantCard, which the roster and the
  participant list share: this row has no role chip to show (every row is
  waitlisted, so a chip saying so on each is noise), it carries the date applied
  instead, and the fold-out belongs inside the card rather than hanging below it
  the way that component's `actions`-only shape forced.
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <ManageHubBackLink hackathonId={data.hackathonId} />
        <h2 class="m-0 text-title text-ink">Waitlist</h2>
        <span class="text-xs text-ink-3">
            {countLabel} &middot; nobody here is in the hackathon yet, and only
            organizers can see them
        </span>
    </div>

    <ParticipantsManageTabs
        hackathonId={data.hackathonId}
        current="waitlist"
        confirmedCount={data.confirmedCount}
        waitingCount={data.waiting.length}
    />

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.waiting.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                Nobody is waiting to join. Approved participants are on the
                Participants tab.
            </p>
        {:else}
            {#each data.waiting as person (person.id)}
                <div class="card card-raised box-border flex w-full flex-col gap-3 px-5 py-4">
                    <div class="flex w-full items-start gap-4">
                        <RoundMedia initials={initials(person.name)} />

                        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                            <h3 class="m-0 text-sm leading-snug text-ink">{person.name}</h3>
                            <p class="m-0 text-xs leading-snug text-ink-3">
                                @{person.username}
                            </p>
                            {#if applied(person.appliedAt)}
                                <p class="m-0 text-xs leading-snug text-ink-3">
                                    Applied {applied(person.appliedAt)}
                                </p>
                            {/if}
                        </div>

                        <div class="flex shrink-0 items-center gap-2">
                            <!-- The one thing an organizer came here to do, so
                                 the accent is on it; Decline is outlined danger
                                 beside it. -->
                            <form
                                method="POST"
                                action="?/approve"
                                use:enhance={submitting(person.id)}
                            >
                                <input type="hidden" name="userId" value={person.id} />
                                <button
                                    type="submit"
                                    disabled={pendingIds.has(person.id)}
                                    class="btn btn-sm btn-accent"
                                >
                                    Approve
                                </button>
                            </form>
                            <!-- Declining deletes the membership row, which is
                                 also how someone reapplies later: there is no
                                 "rejected" state to come back to. -->
                            <form
                                method="POST"
                                action="?/decline"
                                use:enhance={submitting(person.id)}
                            >
                                <input type="hidden" name="userId" value={person.id} />
                                <button
                                    type="submit"
                                    disabled={pendingIds.has(person.id)}
                                    class="btn btn-sm btn-danger"
                                >
                                    Decline
                                </button>
                            </form>
                        </div>
                    </div>

                    <!-- A `details` so a long queue stays scannable, and so it
                         works with no JavaScript. Absent entirely when the
                         hackathon asks nothing. -->
                    {#if data.questionCount > 0}
                        {#if person.answers.length > 0}
                            <details>
                                <summary
                                    class="w-fit cursor-pointer text-xs font-semibold
                                           text-accent-ink"
                                >
                                    Registration answers ({person.answers.length})
                                </summary>
                                <dl class="mt-2 flex flex-col gap-1 border-l border-line pl-3">
                                    {#each person.answers as answer (answer.questionId)}
                                        <div class="flex flex-wrap gap-x-2">
                                            <dt class="text-xs text-ink-3">{answer.label}</dt>
                                            <dd class="m-0 text-xs text-ink">
                                                {#if typeof answer.value === 'boolean'}
                                                    {answer.value ? 'Yes' : 'No'}
                                                {:else}
                                                    {answer.value}
                                                {/if}
                                            </dd>
                                        </div>
                                    {/each}
                                </dl>
                            </details>
                        {:else}
                            <p class="m-0 text-xs text-ink-3">
                                Has not answered the registration form.
                            </p>
                        {/if}
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>
