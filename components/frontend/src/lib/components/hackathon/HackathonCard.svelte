<script lang="ts">
    import { Calendar } from 'lucide-svelte';

    // A hackathon as a panel, for the browse grid. The row component is the
    // dense form used inside dashboards; this is the one you scan.

    let {
        href,
        name,
        meta,
        description,
        badge,
        badgeVariant = 'badge-accent',
        logo,
        gradFrom,
        gradTo,
    }: {
        href: string;
        name: string;
        meta: string;
        description?: string;
        badge?: string;
        badgeVariant?: string;
        /** Event artwork; falls back to the gradient when an event has none. */
        logo?: string;
        gradFrom: string;
        gradTo: string;
    } = $props();
</script>

<a
    {href}
    class="card bg-surface group flex flex-col overflow-hidden
           no-underline transition hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-lg"
>
    <div
        class="relative h-28 w-full shrink-0"
        style="background: linear-gradient(135deg, {gradFrom}, {gradTo})"
    >
        {#if logo}
            <!-- object-contain, not cover: an event's artwork is a logo, and
                 cropping it to fill the strip cuts the wordmark in half. -->
            <img src={logo} alt="" class="h-full w-full object-contain p-4" />
        {/if}
        {#if badge}
            <span class="badge {badgeVariant} absolute top-2 right-2 text-xs">{badge}</span>
        {/if}
    </div>

    <div class="flex flex-1 flex-col gap-2 p-4">
        <h3 class="font-bold leading-snug group-hover:text-accent-ink">{name}</h3>

        {#if meta}
            <p class="flex items-center gap-1.5 text-xs text-ink-3">
                <Calendar class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {meta}
            </p>
        {/if}

        {#if description}
            <!-- Clamped so panels in a row stay the same height whatever the
                 organizer wrote. -->
            <p class="line-clamp-3 text-sm text-ink-2">{description}</p>
        {/if}
    </div>
</a>
