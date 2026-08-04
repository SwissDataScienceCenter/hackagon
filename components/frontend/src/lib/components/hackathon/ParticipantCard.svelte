<script lang="ts">
    import { resolve } from '$app/paths';

    // Deliberately only what a participant row can be given. `affiliation`,
    // `avatarUrl`, `skills` and `linkedinUrl` used to be props here, but `User`
    // has no such fields and `UserService` has no way to write them, so nothing
    // could ever pass them — they were dead parameters that read as pending
    // features. Re-add them alongside the backend columns, not before.
    let {
        name,
        role: roleProp,
        profileDetailsHref = '#',
    }: {
        name: string;
        /** Membership label — "Owner", "Member", "Waitlisted". */
        role?: string;
        profileDetailsHref?: string;
    } = $props();

    const roleLine = $derived(roleProp?.trim() ?? '');

    const initials = name
        .split(' ')
        .filter(Boolean)
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
        <div
            class="flex size-16 shrink-0 items-center justify-center rounded-full
                   border-2 border-surface-200-800 bg-surface-200-800 text-xs font-bold
                   text-surface-950-50"
            aria-hidden="true"
        >
            {initials}
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">{name}</h3>
            {#if roleLine}
                <p class="m-0 text-xs leading-snug text-surface-600-400">{roleLine}</p>
            {/if}
        </div>

        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a class="btn btn-sm preset-tonal-surface" href={resolve(profileDetailsHref as any)} aria-label="View {name} profile">View</a>
    </div>
</div>
