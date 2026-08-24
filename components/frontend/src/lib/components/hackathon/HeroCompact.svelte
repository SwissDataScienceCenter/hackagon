<script lang="ts">
    /**
     * Above this, the description clamps to two lines and offers to expand.
     *
     * A character count rather than a measurement: knowing whether text actually
     * overflows means reading `scrollHeight` after layout, which costs an effect
     * and a second render to save nothing. At two lines of `text-xs` in this
     * column the threshold is wrong only for descriptions sitting right on the
     * boundary, where both answers look the same.
     */
    const CLAMP_CHARS = 180;

    let {
        title,
        dates,
        venue,
        imageUrl,
        participantCount,
        participantCapacity,
        organizers,
        badges = [],
        description = '',
    }: {
        title: string;
        dates: string;
        venue: string;
        imageUrl?: string;
        participantCount: number;
        /**
         * TODO(backend: hackathon-venue-capacity): omitted by every caller —
         * Hackathon has no capacity field, so there is nothing to pass. Until
         * one exists the count renders on its own, without a "/ N" denominator.
         */
        participantCapacity?: number;
        organizers: { name: string; logoUrl: string; logoDarkUrl?: string }[];
        badges?: { label: string; variant: string }[];
        /**
         * The hackathon's own description, or empty.
         *
         * It used to be an About card at the foot of the overview, which is the
         * page for what has changed since the last visit — and a description
         * changes never. It is identity, so it belongs with the rest of the
         * identity, where a first visit lands and a returning one skims past.
         * The dashboard card a member clicks to get here already shows it too.
         */
        description?: string;
    } = $props();

    let expanded = $state(false);
    const clampable = $derived(description.length > CLAMP_CHARS);
</script>

<section
    class="flex flex-col gap-4 bg-raised px-4 py-4 sm:px-10 sm:py-6 md:flex-row md:items-center
           md:gap-8 md:px-20 md:py-4 min-h-0 md:min-h-44"
>
    {#if imageUrl}
        <div
            class="aspect-[4/3] w-full max-w-md shrink-0 overflow-hidden border
                   border-line sm:aspect-auto sm:max-w-none sm:h-36 sm:w-56"
        >
            <img src={imageUrl} alt={title} class="h-full w-full object-cover" />
        </div>
    {/if}

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <span class="text-xs font-semibold text-accent-ink">{dates}</span>
        <h1 class="text-title">{title}</h1>
        {#if badges.length > 0}
            <div class="flex flex-wrap gap-1.5">
                {#each badges as b (b.label)}
                    <span class="badge {b.variant}">{b.label}</span>
                {/each}
            </div>
        {/if}
        <!-- Clamped, because the hero is identity at a glance and a long
             description would push the count off a phone. The toggle expands it
             in place — there is nowhere else in the member subtree that carries
             the full text. -->
        {#if description}
            <div class="flex flex-col items-start gap-0.5">
                <p class="prose m-0 text-xs text-ink-2 {expanded ? '' : 'line-clamp-2'}">
                    {description}
                </p>
                {#if clampable}
                    <button
                        type="button"
                        class="text-xs font-semibold text-accent-ink hover:underline"
                        onclick={() => (expanded = !expanded)}
                    >
                        {expanded ? 'Less' : 'More'}
                    </button>
                {/if}
            </div>
        {/if}
        <!-- Both guarded rather than always rendered: `venue` is the empty string
             and `organizers` is empty on every hackathon there is (Hackathon
             carries neither field), and an empty span plus an empty flex row still
             spend vertical rhythm on nothing. -->
        {#if venue}
            <span class="text-xs text-accent-ink">{venue}</span>
        {/if}
        {#if organizers.length > 0}
            <div class="mt-1 flex flex-wrap items-center gap-3 sm:gap-4">
                {#each organizers as org (org.name)}
                    <div class="flex h-4 min-w-0 max-w-24 items-center sm:w-16">
                        {#if org.logoDarkUrl}
                            <img src={org.logoUrl} alt={org.name} class="block max-h-full max-w-full object-contain dark:hidden" />
                            <img src={org.logoDarkUrl} alt={org.name} class="hidden max-h-full max-w-full object-contain dark:block" />
                        {:else}
                            <img src={org.logoUrl} alt={org.name} class="max-h-full max-w-full object-contain invert dark:invert-0" />
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div
        class="flex flex-row items-center justify-between gap-2 border-t border-line pt-3
               sm:flex-col sm:justify-center sm:gap-1 sm:border-0 sm:pt-0 md:shrink-0
               text-ink-2"
    >
        <div class="flex items-baseline gap-1.5 sm:flex-col sm:items-center sm:gap-0">
            <span class="text-display">{participantCount}</span>
            {#if participantCapacity !== undefined}
                <span class="text-xs">/ {participantCapacity}</span>
            {/if}
        </div>
        <span class="text-xs text-ink-3 sm:text-center">participants</span>
    </div>
</section>
