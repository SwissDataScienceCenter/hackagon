<script lang="ts">
    import { UserPlus } from 'lucide-svelte';

    let {
        heading,
        subtitle,
        buttonLabel,
        buttonHref,
        note,
    }: {
        heading: string;
        subtitle: string;
        buttonLabel: string;
        buttonHref: string;
        note?: string;
    } = $props();
</script>

<section class="flex flex-col items-center gap-4 px-4 py-12 sm:px-10 md:px-20">
    <h2 class="text-2xl font-bold">{heading}</h2>
    <p class="text-sm text-ink-2">{subtitle}</p>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href={buttonHref} class="btn btn-solid no-underline">
        <UserPlus class="h-4 w-4" />
        {buttonLabel}
    </a>
    {#if note}
        <span class="text-xs text-ink-2">{note}</span>
    {/if}
</section>
