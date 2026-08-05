<script lang="ts">
    import type { Snippet } from 'svelte';

    let {
        name,
        affiliation,
        avatarUrl,
        role: roleProp,
        skills = [],
        linkedinUrl,
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
        /**
         * The card's controls — e.g. an owner's Approve/Remove buttons. Left to
         * the caller so this card stays ignorant of hackathon roles and
         * permissions.
         *
         * There is no "View" link any more: participant profiles have no page of
         * their own, and a button onto `#` is a control that looks live and does
         * nothing. Add one back when a profile route exists.
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
    <div class="flex w-full items-start gap-4">
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

        {#if actions}
            <div class="flex shrink-0 items-center gap-2">
                {@render actions()}
            </div>
        {/if}
    </div>
</div>
