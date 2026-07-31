<script lang="ts">
    let {
        title,
        dates,
        badges = [],
    }: {
        title: string;
        dates: string;
        badges?: { label: string; preset: string }[];
    } = $props();
</script>

<section
    class="flex flex-wrap items-center justify-between gap-2 bg-surface-100-900 px-4 py-3
           sm:px-10 md:px-20"
>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h1 class="m-0 truncate text-base font-bold text-surface-950-50">{title}</h1>
        {#if badges.length > 0}
            <div class="flex flex-wrap gap-1.5">
                <!-- Keyed by position, not label: badge text can carry
                     user-supplied names (e.g. a team), which are not unique. -->
                {#each badges as b, i (i)}
                    <span class="badge {b.preset} text-xs">{b.label}</span>
                {/each}
            </div>
        {/if}
    </div>
    {#if dates}
        <span class="shrink-0 text-xs text-primary-700-300">{dates}</span>
    {/if}
</section>
