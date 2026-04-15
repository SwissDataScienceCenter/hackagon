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

<section class="flex flex-col items-center gap-4 border-t border-surface-200 px-20 py-14 dark:border-surface-800">
    <h2 class="text-2xl font-bold">{heading}</h2>
    <p class="text-sm text-surface-700 dark:text-surface-100">{subtitle}</p>
    <a href={buttonHref} class="btn preset-filled-primary-500 no-underline">
        <UserPlus class="h-4 w-4" />
        {buttonLabel}
    </a>
    {#if note}
        <span class="text-xs text-surface-700 dark:text-surface-100">{note}</span>
    {/if}
</section>
