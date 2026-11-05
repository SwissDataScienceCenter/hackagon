<script lang="ts">
    import { avatarInitials } from '$lib/utils/initials';

    let {
        members,
    }: {
        members: {
            name: string;
            imageUrl?: string;
            /** Their participant profile. Absent, the member is drawn but not
             *  a link. The caller builds it, so this stays ignorant of routes. */
            href?: string;
        }[];
    } = $props();
</script>

<!--
  A team's people as a row of small avatars, each with the name under it — on
  the teams list inside TeamCard, and on a team's own page on its own.
-->
<div class="flex flex-wrap gap-4">
    {#each members as member, i (i)}
        {#if member.href}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller passes a resolved path -->
            <a href={member.href}
                class="group flex w-16 min-w-0 max-w-16 flex-col items-center gap-1
                       no-underline"
            >
                {@render face(member)}
            </a>
        {:else}
            <div class="flex w-16 min-w-0 max-w-16 flex-col items-center gap-1">
                {@render face(member)}
            </div>
        {/if}
    {/each}
</div>

{#snippet face(member: { name: string; imageUrl?: string })}
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
