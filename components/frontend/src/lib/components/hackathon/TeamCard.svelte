<script lang="ts">
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
    }: {
        num: number;
        title: string;
        projectDescription: string;
        imageUrl?: string;
        members: TeamMember[];
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
        </div>
    </div>
</div>
