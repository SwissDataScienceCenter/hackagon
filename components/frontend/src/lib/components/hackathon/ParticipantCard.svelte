<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        name,
        affiliation,
        avatarUrl,
        role: roleProp,
        skills = [],
        linkedinUrl,
        profileDetailsHref = '#',
    }: {
        name: string;
        affiliation?: string;
        avatarUrl?: string;
        /** Job title; if omitted, first skills are shown on the role line. */
        role?: string;
        skills?: string[];
        linkedinUrl?: string;
        profileDetailsHref?: string;
    } = $props();

    const roleLine = $derived(
        roleProp?.trim() ||
            (skills.length > 0 ? skills.slice(0, 4).join(', ') : '')
    );

    const initials = name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

</script>

<!--
  Matches TeamCard: one row, py-4 px-5, gap-4, size-16 avatar, text column gap-1.5,
  title text-sm font-bold, body text-xs, CTA: btn btn-sm preset-tonal-surface.
-->
<div
    class="box-border w-full border border-surface-200-800 bg-surface-100-900
           py-4 px-5"
>
    <div class="flex w-full items-start gap-4">
        {#if avatarUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-surface-200-800 bg-surface-100-900"
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
                       border-2 border-surface-200-800 bg-surface-200-800 text-xs font-bold
                       text-surface-950-50"
            >
                {initials}
            </div>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">{name}</h3>
            <div class="block w-2/3 min-w-0">
                <div class="flex flex-col gap-1.5">
                    {#if roleLine}
                        <p class="m-0 text-xs leading-snug text-surface-600-400">{roleLine}</p>
                    {/if}
                    {#if affiliation}
                        <p class="m-0 text-xs leading-snug text-surface-500">{affiliation}</p>
                    {/if}
                    {#if linkedinUrl}
                        <!-- eslint-disable svelte/no-navigation-without-resolve -- external LinkedIn URL -->
                        <a
                            href={linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="w-fit text-xs leading-snug text-primary-600-400
                                   hover:underline"
                        >
                            LinkedIn Profile
                        </a>
                        <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    {/if}
                </div>
            </div>
        </div>

        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a class="btn btn-sm preset-tonal-surface" href={resolve(profileDetailsHref as any)} aria-label="View {name} profile">View</a>
    </div>
</div>
