<script lang="ts">
    import { UserPlus } from 'lucide-svelte';

    let {
        heading,
        subtitle,
        buttonLabel,
        buttonHref,
        note,
        external = false,
    }: {
        heading: string;
        subtitle: string;
        buttonLabel: string;
        buttonHref: string;
        note?: string;
        // Opt in for an off-site buttonHref: marks the link outgoing the way the
        // rest of the app does. Left off, the button navigates in-app as before.
        external?: boolean;
    } = $props();
</script>

<section class="flex flex-col items-center gap-4 px-4 py-12 sm:px-10 md:px-20">
    <h2 class="text-display">{heading}</h2>
    <p class="text-sm text-ink-2">{subtitle}</p>
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
        href={buttonHref}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        aria-label={external ? `${buttonLabel} (opens in a new tab)` : undefined}
        class="btn btn-solid no-underline"
    >
        <UserPlus class="h-4 w-4" />
        {buttonLabel}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {#if note}
        <span class="text-xs text-ink-2">{note}</span>
    {/if}
</section>
