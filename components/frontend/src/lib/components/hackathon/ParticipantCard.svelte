<script lang="ts">
    import { resolve } from '$app/paths';
    import type { Snippet } from 'svelte';

    let {
        name,
        affiliation,
        avatarUrl,
        role: roleProp,
        skills = [],
        linkedinUrl,
        profileDetailsHref = '#',
        actions,
    }: {
        name: string;
        /**
         * TODO(backend: user-profile-fields): unset by the participants page —
         * User carries only username, displayName, email and keycloakId, so
         * there is no affiliation to pass. Same for `avatarUrl`, `skills` and
         * `linkedinUrl`: the card simply omits those lines until the fields
         * exist, at which point the page passes them straight through.
         */
        affiliation?: string;
        avatarUrl?: string;
        /** Job title; if omitted, first skills are shown on the role line. */
        role?: string;
        skills?: string[];
        linkedinUrl?: string;
        profileDetailsHref?: string;
        /**
         * Extra controls rendered beside "View" — e.g. an owner's Approve/Remove
         * buttons. Left to the caller so this card stays ignorant of hackathon
         * roles and permissions.
         */
        actions?: Snippet;
    } = $props();

    const roleLine = $derived(
        roleProp?.trim() ||
            (skills.length > 0 ? skills.slice(0, 4).join(', ') : '')
    );

    const initials = name
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

</script>

<!--
  Matches TeamCard: one row, px-5 py-4, gap-4, size-16 avatar, text column gap-1.5,
  title text-sm, body text-xs, CTA: btn btn-sm btn-ghost.
-->
<div
    class="card card-raised box-border w-full px-5 py-4"
>
    <!-- flex-wrap + the actions group's w-full/sm:w-auto: at phone widths the
         controls (View / Approve / Make organizer / Remove — up to ~230px,
         shrink-0 by design so buttons never squeeze) take their own row under
         the card instead of pushing the card past the viewport. From sm up
         nothing wraps and the row is exactly what it was. -->
    <div class="flex w-full flex-wrap items-start gap-4">
        {#if avatarUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-line bg-raised"
            >
                <img
                    src={avatarUrl}
                    alt=""
                    class="absolute inset-0 block h-full w-full object-cover object-center"
                />
            </div>
        {:else}
            <div
                class="flex size-16 shrink-0 items-center justify-center rounded-full
                       border-2 border-line bg-overlay text-xs font-bold
                       text-ink"
            >
                {initials}
            </div>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 class="m-0 text-sm leading-snug text-ink">{name}</h3>
            <div class="block w-2/3 min-w-0">
                <div class="flex flex-col gap-1.5">
                    {#if roleLine}
                        <p class="m-0 text-xs leading-snug text-ink-2">{roleLine}</p>
                    {/if}
                    {#if affiliation}
                        <p class="m-0 text-xs leading-snug text-ink-3">{affiliation}</p>
                    {/if}
                    {#if linkedinUrl}
                        <!-- eslint-disable svelte/no-navigation-without-resolve -- external LinkedIn URL -->
                        <a
                            href={linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="w-fit text-xs leading-snug text-accent-ink
                                   hover:underline"
                        >
                            LinkedIn Profile
                        </a>
                        <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    {/if}
                </div>
            </div>
        </div>

        <div class="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
            <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
            <a class="btn btn-sm btn-ghost" href={resolve(profileDetailsHref as any)} aria-label="View {name} profile">View</a>
            {#if actions}
                {@render actions()}
            {/if}
        </div>
    </div>
</div>
