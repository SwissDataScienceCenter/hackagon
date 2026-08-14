<script lang="ts">
    import { resolve } from '$app/paths';
    import {
        membershipBadgeLabel,
        membershipBadgeVariant,
    } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const person = $derived(data.person);
    const membership = $derived(data.membership);
    const registration = $derived(data.registration);

    const badgeLabel = $derived(
        membershipBadgeLabel(membership.isWaiting, membership.role)
    );
    const badgeVariant = $derived(membershipBadgeVariant(membership.isWaiting));

    // Same treatment as ParticipantCard, so arriving here from a roster row
    // reads as the same person enlarged rather than a different page.
    const initials = $derived(
        person.name
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    );

    function on(d: Date | undefined): string | undefined {
        if (!d) return undefined;
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    const joinedOn = $derived(on(membership.joinedAt));
    const submittedOn = $derived(on(registration.submittedAt));
    // Only worth a line when it says something the submitted date does not.
    const editedOn = $derived.by(() => {
        const edited = on(registration.modifiedAt);
        return edited && edited !== submittedOn ? edited : undefined;
    });

    // Name, username and email are never put in an ATTRIBUTE (no title=, no
    // alt=): the session-replay tracker masks text nodes and input values and
    // sends attribute values verbatim, so an attribute here would ship this
    // person's details in clear.
    const facts = $derived(
        [
            { label: 'Username', value: person.username },
            { label: 'Email', value: person.email },
            { label: 'Affiliation', value: person.affiliation },
            { label: 'Skills', value: person.skills },
            { label: 'Dietary requirements', value: person.dietary },
            { label: 'Joined', value: joinedOn ?? '' },
        ].filter((f) => f.value.trim() !== '')
    );
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/projects/teams). -->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <a
        href={resolve(`/my/hackathon/${data.hackathonId}/participants`)}
        class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
    >
        &larr; Back to participants
    </a>

    <div class="flex items-start gap-4">
        {#if person.avatarUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-line bg-raised"
            >
                <img
                    src={person.avatarUrl}
                    alt=""
                    class="absolute inset-0 block h-full w-full object-cover object-center"
                />
            </div>
        {:else}
            <div
                class="flex size-16 shrink-0 items-center justify-center rounded-full border-2
                       border-line bg-overlay text-xs font-bold text-ink"
            >
                {initials}
            </div>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
                <h1 class="m-0 text-title leading-snug text-ink">{person.name}</h1>
                <!-- The badge STATES the standing; it is not the card that
                     happens to contain the controls for changing it. -->
                <span class="badge {badgeVariant} shrink-0">{badgeLabel}</span>
            </div>
            <p class="m-0 text-xs leading-snug text-ink-3">
                In this hackathon only — role, standing and the answers given to
                this event's registration form.
            </p>
        </div>
    </div>

    <dl class="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each facts as fact (fact.label)}
            <div class="flex flex-col gap-1">
                <dt class="text-xs font-semibold text-ink-3">{fact.label}</dt>
                <dd class="m-0 text-xs break-words text-ink">{fact.value}</dd>
            </div>
        {/each}
    </dl>

    <div class="flex flex-col gap-2">
        <h2 class="m-0 meta">Registration</h2>
        <div
            class="card card-raised box-border flex w-full flex-col gap-4 px-5 py-4"
        >
            {#if registration.unavailable}
                <!-- The read failed; everything above it did not. Said plainly
                     rather than shown as an empty form, which would be this
                     page asserting something it never managed to look up. -->
                <p class="m-0 text-xs text-ink-3">
                    The registration answers could not be loaded. Everything
                    else on this page is up to date.
                </p>
            {:else if !registration.hasForm}
                <p class="m-0 text-xs text-ink-3">
                    This hackathon asks no registration questions.
                </p>
            {:else if !registration.submitted}
                <p class="m-0 text-xs text-ink-3">
                    This person has not filled in the registration form yet.
                </p>
            {:else}
                {#if registration.answers.length > 0}
                    <dl class="m-0 flex flex-col gap-3">
                        {#each registration.answers as answer (answer.label)}
                            <div class="flex flex-col gap-1">
                                <dt class="text-xs font-semibold text-ink-3">
                                    {answer.label}
                                </dt>
                                <dd class="m-0 text-xs break-words text-ink-2">
                                    {answer.value}
                                </dd>
                            </div>
                        {/each}
                    </dl>
                {:else}
                    <p class="m-0 text-xs text-ink-3">
                        The form was submitted with no answers filled in.
                    </p>
                {/if}

                {#if registration.consents.length > 0}
                    <!-- Not filtered to the ones given: a consent that was
                         WITHHELD is what an organiser opens this to check, so it
                         has to be a visible row and not an absent one. -->
                    <ul class="m-0 flex list-none flex-col gap-2 border-t border-line p-0 pt-4">
                        {#each registration.consents as consent (consent.label)}
                            <li class="flex flex-wrap items-baseline gap-2 text-xs">
                                <span
                                    class="badge {consent.given
                                        ? 'badge-success'
                                        : 'badge-warning'} shrink-0"
                                >
                                    {consent.given ? 'Given' : 'Not given'}
                                </span>
                                <span class="min-w-0 text-ink-2">{consent.label}</span>
                            </li>
                        {/each}
                    </ul>
                {/if}

                {#if submittedOn}
                    <p class="m-0 text-xs text-ink-3">
                        Submitted {submittedOn}{#if editedOn}
                            &middot; edited {editedOn}{/if}{#if registration.submittedByName}
                            &middot; entered by {registration.submittedByName}{/if}
                    </p>
                {/if}
            {/if}
        </div>
    </div>
</div>
