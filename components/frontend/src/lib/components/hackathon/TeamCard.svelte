<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import type { Snippet } from 'svelte';

    type TeamMember = {
        name: string;
        imageUrl?: string;
    };

    let {
        num,
        title,
        projectDescription,
        imageUrl,
        members,
        actions,
    }: {
        // Optional because it is a position in a list, not a property of the
        // team: on the detail page there is no list to be nth of.
        num?: number;
        title: string;
        /**
         * Markdown, rendered in full. Optional because the teams list leaves it
         * out — there the project's title links to its page instead — and only
         * the team detail page carries it.
         */
        projectDescription?: string;
        imageUrl?: string;
        members: TeamMember[];
        /**
         * The card's controls, in a column to the right — the same shape
         * `ParticipantCard` uses, and left to the caller for the same reason:
         * this card stays ignorant of where a team can be looked at or acted on.
         *
         * The teams list passes a View link onto `teams/<teamId>` this way. The
         * detail page passes nothing, since that link would lead to itself.
         */
        actions?: Snippet;
    } = $props();

    function memberInitials(name: string): string {
        return name
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }
</script>

<!--
  ParticipantCard-style row: avatar | text column (title, description, members).
  Members sit in the text column so they line up with title/description, not under the team avatar.

  `actions` is the caller's, and only the list passes one: renaming, deleting and
  assigning people are organiser actions that live on the manage page, so the one
  control a read-only surface has to offer is a way in to the single team — which
  is the list's View link and nothing the detail page needs.
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
                    {#if num !== undefined}{num}. {/if}{title}
                </h3>
                {#if projectDescription}
                    <!-- Rendered, as on the project's own page: the proposal is
                         written in the markdown editor, and as plain text its
                         headings and lists arrived as raw `#` and `-`. -->
                    <div class="w-2/3 min-w-0 text-xs leading-snug text-ink-2">
                        <MarkdownContent content={projectDescription} />
                    </div>
                {/if}
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
        </div>

        {#if actions}
            <div class="flex shrink-0 items-center gap-2">
                {@render actions()}
            </div>
        {/if}
    </div>
</div>
