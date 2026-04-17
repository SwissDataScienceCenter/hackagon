<script lang="ts">
    let {
        name,
        affiliation,
        avatarUrl,
        skills = [],
        registeredAt,
    }: {
        name: string;
        affiliation: string;
        avatarUrl?: string;
        skills?: string[];
        registeredAt?: string;
    } = $props();

    const initials = name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
</script>

<div class="flex h-14 items-center gap-4 px-4 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800">
    {#if avatarUrl}
        <img
            src={avatarUrl}
            alt={name}
            class="h-8 w-8 shrink-0 rounded-full object-cover"
        />
    {:else}
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-bold dark:bg-surface-700">
            {initials}
        </div>
    {/if}

    <div class="flex flex-1 flex-col gap-0.5">
        <span class="text-sm font-semibold">{name}</span>
        <span class="text-xs text-surface-500">{affiliation}</span>
    </div>

    {#if skills.length > 0}
        <div class="flex gap-1.5">
            {#each skills.slice(0, 3) as skill (skill)}
                <span class="badge preset-tonal-surface text-xs">{skill}</span>
            {/each}
            {#if skills.length > 3}
                <span class="text-xs text-surface-500">+{skills.length - 3}</span>
            {/if}
        </div>
    {/if}

    {#if registeredAt}
        <span class="text-xs text-surface-500">{registeredAt}</span>
    {/if}
</div>
