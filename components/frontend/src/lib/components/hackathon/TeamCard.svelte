<script lang="ts">
    import { Lightbulb } from 'lucide-svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import { avatarInitials } from '$lib/utils/initials';
    import type { Snippet } from 'svelte';

    type TeamMember = {
        name: string;
        imageUrl?: string;
        /** Their participant profile. Absent, the member is drawn but not a
         *  link. The caller builds it, so this card stays ignorant of routes. */
        href?: string;
    };

    let {
        num,
        title,
        projectTitle,
        projectHref,
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
         * The project the team is on. Its initials stand in for a missing image,
         * so the team shows the same two letters as the project's own row.
         * Absent when the viewer cannot see the project — the team's name then
         * gives the letters instead, so the circle is never empty.
         */
        projectTitle?: string;
        /**
         * Where the project line under the team name leads. Without it there is
         * no project line: the detail page already has the project as its
         * heading, so it passes the title for the initials and leaves this out.
         */
        projectHref?: string;
        /**
         * Markdown, rendered in full. Optional because the teams list leaves it
         * out — there the project line links to its page instead — and only
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

    // TODO(backend: team-image): the image is the project's, so the letters are
    // too. Once a team has an image of its own this may want its own name.
    const initials = $derived(avatarInitials(projectTitle || title));
</script>

<!--
  ParticipantCard-style row: avatar | text column (title, project, description, members).
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
        <RoundMedia src={imageUrl} {initials} />

        <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div class="flex flex-col gap-1.5">
                <h3 class="m-0 text-sm leading-snug text-ink">
                    {#if num !== undefined}{num}. {/if}{title}
                </h3>
                <!-- The project behind its own icon, as ProjectCard puts the
                     author behind a person: an attribute of the row, not a
                     second title. The icon is aria-hidden — the link text says
                     what it is. -->
                {#if projectTitle && projectHref}
                    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller passes a resolved path, with its query -->
                    <a href={projectHref}
                        class="inline-flex w-fit items-center gap-1.5 text-xs text-ink-3
                               no-underline hover:text-accent-ink hover:underline"
                    >
                        <Lightbulb class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {projectTitle}
                    </a>
                {/if}
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
                    {#if member.href}
                        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller passes a resolved path -->
                        <a href={member.href}
                            class="group flex w-16 min-w-0 max-w-16 flex-col items-center gap-1
                                   no-underline"
                        >
                            {@render memberFace(member)}
                        </a>
                    {:else}
                        <div class="flex w-16 min-w-0 max-w-16 flex-col items-center gap-1">
                            {@render memberFace(member)}
                        </div>
                    {/if}
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

{#snippet memberFace(member: TeamMember)}
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
            {avatarInitials(member.name)}
        </div>
    {/if}
    <span
        class="line-clamp-2 w-full min-w-0 break-words text-center
               text-xs leading-tight text-ink-3 group-hover:text-accent-ink"
        title={member.name}
    >
        {member.name}
    </span>
{/snippet}
