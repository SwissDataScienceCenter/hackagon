<script lang="ts">
    import Github from 'lucide-svelte/icons/github';
    import Link from 'lucide-svelte/icons/link';
    import Linkedin from 'lucide-svelte/icons/linkedin';
    import { PROFILE_LINK_KINDS, type ProfileLinks } from '$lib/utils/profileLinks';

    let {
        links,
        variant = 'compact',
    }: {
        links: ProfileLinks;
        /**
         * `compact` is the icon and site name, for rows about someone else.
         * `full` adds the URL itself, one link per line — for the person's own
         * Account page, where the point is to check which address was saved.
         */
        variant?: 'compact' | 'full';
    } = $props();

    // Renku has no mark in lucide, so it gets the generic link.
    const ICON = { github: Github, linkedin: Linkedin, renku: Link };

    const shown = $derived(PROFILE_LINK_KINDS.filter((kind) => links[kind.key] !== ''));
</script>

<!--
  A person's GitHub, LinkedIn and Renku links, the ones they set themselves on
  the Account page. Renders nothing when none is set, so a caller can drop it in
  unconditionally.

  Each href is safe as given: the backend builds it from a fixed https prefix
  and an escaped username, never from what was typed (see $lib/utils/profileLinks).
-->
{#if shown.length > 0}
    <ul
        class="m-0 flex list-none gap-x-3 gap-y-1 p-0
               {variant === 'full' ? 'flex-col' : 'flex-wrap items-center'}"
    >
        {#each shown as kind (kind.key)}
            {@const Icon = ICON[kind.key]}
            <li class="min-w-0">
                <!-- eslint-disable svelte/no-navigation-without-resolve -- external profile URL -->
                <a
                    href={links[kind.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex max-w-full items-center gap-1 text-xs leading-snug
                           text-accent-ink hover:underline"
                >
                    <Icon class="size-3.5 shrink-0" aria-hidden="true" />
                    {kind.label}
                    {#if variant === 'full'}
                        <!-- Truncated, not wrapped: a URL broken across lines is
                             harder to check than one cut short, and the href and
                             the tooltip still carry all of it. -->
                        <span class="truncate text-ink-3" title={links[kind.key]}
                            >{links[kind.key]}</span
                        >
                    {/if}
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            </li>
        {/each}
    </ul>
{/if}
