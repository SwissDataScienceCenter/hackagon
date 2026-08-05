<script lang="ts">
    import {
        submissionStatusLabel,
        submissionStatusBadgeVariant,
    } from '$lib/utils/submissionStatus';
    import { isHttpUrl } from '$lib/utils/url';

    type TeamMember = {
        name: string;
        imageUrl?: string;
    };

    // Structural, not the generated `Submission`: that type lives behind
    // $lib/server and must never be imported into a component. The load hands
    // over a plain object, already narrowed to the one version that counts.
    type FinalEntry = {
        version: number;
        result?: string;
        finalizedAt?: Date;
        finalizedBy?: string;
    };

    let {
        num,
        title,
        projectDescription,
        imageUrl,
        members,
        isOwn = false,
        entry = null,
    }: {
        num: number;
        title: string;
        projectDescription: string;
        imageUrl?: string;
        members: TeamMember[];
        isOwn?: boolean;
        entry?: FinalEntry | null;
    } = $props();

    // SubmissionStatus.SUBMISSION_STATUS_FINAL — the numeric value, since the
    // generated enum is server-only. `entry` is a final by construction (see
    // the load), so the status is fixed rather than passed in.
    const FINAL = 2;

    function memberInitials(name: string): string {
        return name
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
</script>

<!--
  ParticipantCard-style row: avatar | text column (title, description, members).
  Members sit in the text column so they line up with title/description, not under the team avatar.

  No actions column: a team is read-only here. Renaming, deleting and assigning
  people are organiser actions and live on the manage page; nothing in this view
  acts on a single team, so there is nowhere for a per-card control to lead.
-->
<div
    class="card card-raised box-border w-full px-5 py-4"
>
    <div class="flex w-full items-start gap-4">
        {#if imageUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-line bg-raised"
            >
                <img
                    src={imageUrl}
                    alt=""
                    class="absolute inset-0 block h-full w-full object-cover object-center"
                />
            </div>
        {:else}
            <div
                class="size-16 shrink-0 rounded-full border-2 border-line
                       bg-raised"
            ></div>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div class="flex flex-col gap-1.5">
                <h3 class="m-0 text-sm leading-snug text-ink">
                    {num}. {title}
                </h3>
                <div class="block w-2/3 min-w-0">
                    <p class="m-0 text-xs leading-snug text-ink-2">
                        {projectDescription}
                    </p>
                </div>
            </div>

            <div class="flex flex-wrap gap-4">
                {#each members as member, i (i)}
                    <div class="flex w-16 min-w-0 max-w-16 flex-col items-center gap-1">
                        {#if member.imageUrl}
                            <div
                                class="relative size-9 shrink-0 overflow-hidden rounded-full
                                       border-2 border-line bg-raised"
                            >
                                <img
                                    src={member.imageUrl}
                                    alt=""
                                    class="absolute inset-0 h-full w-full object-cover"
                                />
                            </div>
                        {:else}
                            <div
                                class="flex size-9 shrink-0 items-center justify-center
                                       rounded-full border-2 border-line
                                       bg-overlay text-xs font-bold text-ink"
                            >
                                {memberInitials(member.name)}
                            </div>
                        {/if}
                        <span
                            class="line-clamp-2 w-full min-w-0 break-words text-center
                                   text-xs leading-tight text-ink-3"
                            title={member.name}
                        >
                            {member.name}
                        </span>
                    </div>
                {/each}
            </div>

            {#if entry}
                <!--
                  Only a finalized entry ever appears here — the load drops
                  drafts before they leave the server. A team without one shows
                  nothing rather than "no entry yet", which would otherwise read
                  as a failure on every card of a hackathon that has not reached
                  submissions.
                -->
                <div class="flex flex-col gap-1 border-t border-line pt-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-semibold text-ink">
                            {isOwn ? "Your team's entry" : 'Entry'}
                        </span>
                        <span
                            class="badge {submissionStatusBadgeVariant(FINAL) ??
                                'badge-neutral'}"
                        >
                            {submissionStatusLabel(FINAL) ?? 'Final'}
                        </span>
                        <span class="text-xs text-ink-3">version {entry.version}</span>
                    </div>

                    {#if entry.result}
                        {#if isHttpUrl(entry.result)}
                            <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
                            <a
                                href={entry.result}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="m-0 block break-all text-xs leading-snug
                                       text-accent-ink hover:underline"
                            >
                                {entry.result}
                            </a>
                            <!-- eslint-enable svelte/no-navigation-without-resolve -->
                        {:else}
                            <p class="m-0 text-xs leading-snug text-ink-2">{entry.result}</p>
                        {/if}
                    {:else}
                        <p class="m-0 text-xs italic leading-snug text-ink-3">
                            No link or notes on this version.
                        </p>
                    {/if}

                    {#if entry.finalizedAt}
                        <span class="text-xs text-ink-3">
                            Finalized {formatDate(entry.finalizedAt)}{#if entry.finalizedBy}
                                by {entry.finalizedBy}{/if}
                        </span>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>
