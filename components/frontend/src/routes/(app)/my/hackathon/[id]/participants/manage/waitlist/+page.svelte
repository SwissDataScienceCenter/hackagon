<script lang="ts">
    import { resolve } from '$app/paths';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ParticipantsManageTabs from '$lib/components/hackathon/ParticipantsManageTabs.svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

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

  The approval queue, as the second tab of Manage Participants rather than a
  destination of its own — the roster is the same list of people at a different
  stage, and the count on the tab beside this one is how either half is found.

  **Nothing is decided here.** Approve and Decline live on the applicant's own
  page, under the registration answers they are a judgement of — the row offers
  "Review", which is the way there. Those answers used to unfold under every row
  and be decided on in place; what that bought was a fast sweep down the queue,
  what it cost was letting somebody in from a row. The projects queue made the
  same trade for the same reason.

  Rows are built here rather than with ParticipantCard, which the roster and the
  participant list share: this row has no role chip to show (every row is
  waitlisted, so a chip saying so on each is noise) and carries the date applied
  instead.
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

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.waiting.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                Nobody is waiting to join. Approved participants are on the
                Participants tab.
            </p>
        {:else}
            {#each data.waiting as person (person.id)}
                <div class="card card-raised box-border flex w-full items-start gap-4 px-5 py-4">
                    <RoundMedia initials={initials(person.name)} />

                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                        <h3 class="m-0 text-sm leading-snug text-ink">{person.name}</h3>
                        <p class="m-0 text-xs leading-snug text-ink-3">@{person.username}</p>
                        {#if applied(person.appliedAt)}
                            <p class="m-0 text-xs leading-snug text-ink-3">
                                Applied {applied(person.appliedAt)}
                            </p>
                        {/if}
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                        <!-- Marked, not counted: an application with nothing
                             filled in is the one an organizer wants to see
                             before opening it, since there will be nothing there
                             to decide on. Absent when the hackathon asks
                             nothing. -->
                        {#if data.questionCount > 0 && !person.answered}
                            <span class="badge badge-neutral">No answers</span>
                        {/if}
                        <!-- The only control on the row. `from=waitlist` is what
                             sends Approve and Decline back here rather than to
                             the roster the approved person has just joined. -->
                        <a
                            href="{resolve(
                                `/my/hackathon/${data.hackathonId}/participants/manage/${person.id}`
                            )}?from=waitlist"
                            class="btn btn-sm btn-accent no-underline"
                        >
                            Review
                        </a>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>
