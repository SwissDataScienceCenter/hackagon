<script lang="ts">
    import { resolve } from '$app/paths';
    import { Pencil } from 'lucide-svelte';

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
        isOwn = false,
        moreInfoHref = '#',
    }: {
        num: number;
        title: string;
        projectDescription: string;
        imageUrl?: string;
        members: TeamMember[];
        isOwn?: boolean;
        moreInfoHref?: string;
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
  ParticipantCard-style row: avatar | text column (title, description, members) | actions.
  Members sit in the text column so they line up with title/description, not under the team avatar.
-->
<div
    class="box-border w-full border border-surface-200-800 bg-surface-100-900
           py-4 px-5"
>
    <div class="flex w-full items-start gap-4">
        {#if imageUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-surface-200-800 bg-surface-100-900"
            >
                <img
                    src={imageUrl}
                    alt=""
                    class="absolute inset-0 block h-full w-full object-cover object-center"
                />
            </div>
        {:else}
            <div
                class="size-16 shrink-0 rounded-full border-2 border-surface-200-800
                       bg-surface-100-900"
            ></div>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div class="flex flex-col gap-1.5">
                <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
                    {num}. {title}
                </h3>
                <div class="block w-2/3 min-w-0">
                    <p class="m-0 text-xs leading-snug text-surface-600-400">
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
                                       border-2 border-surface-200-800 bg-surface-100-900"
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
                                       rounded-full border-2 border-surface-200-800
                                       bg-surface-200-800 text-xs font-bold text-surface-950-50"
                            >
                                {memberInitials(member.name)}
                            </div>
                        {/if}
                        <span
                            class="line-clamp-2 w-full min-w-0 break-words text-center
                                   text-xs leading-tight text-surface-500"
                            title={member.name}
                        >
                            {member.name}
                        </span>
                    </div>
                {/each}
            </div>
        </div>

        {#if isOwn}
            <button
                type="button"
                class="btn btn-sm preset-tonal-surface"
                aria-label="Edit team"
            >
                <Pencil class="size-4" />
            </button>
        {/if}

        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(moreInfoHref as any)} class="btn btn-sm preset-tonal-surface">
            More Information
        </a>
    </div>
</div>
