<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import { SvelteSet } from 'svelte/reactivity';
    import Plus from 'lucide-svelte/icons/plus';
    import Pencil from 'lucide-svelte/icons/pencil';
    import ArrowRight from 'lucide-svelte/icons/arrow-right';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import { canEditHackathon, platformNav, type NavItem } from '$lib/navigation';
    import { statusLabel, statusBadgeVariant, membershipBadgeLabel, membershipBadgeVariant } from '$lib/utils/hackathonStatus';
    import { displayableGlobalRoles, globalRoleBadgeVariant, globalRoleLabel } from '$lib/utils/globalRole';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonEntry {
        id: string;
        name: string;
        startsAt?: Date;
        endsAt?: Date;
        status: number;
        /** The event's cover, shown as the row thumbnail. */
        logo?: string;
        viewerMembership?: HackathonMember;
    }

    interface SessionProp {
        user?: { name?: string | null; id?: string } | null;
    }

    interface Props {
        session: SessionProp | null | undefined;
        myHackathons: HackathonEntry[];
        otherHackathons: HackathonEntry[];
        /**
         * Whether to offer hackathon creation. Mirrors the backend's own
         * `hackathon:create` — organizers and, via the admin escape hatch,
         * admins — so the button never lands anyone on a 403. The action is
         * still the backend's to refuse; this only decides whether to offer it.
         */
        canCreate?: boolean;
        /**
         * Whether the viewer holds the global admin role.
         *
         * Gates two things on this page: editing any hackathon regardless of
         * ownership, and the platform administration section as a whole — the
         * settings pages behind it need exactly this role, `UserService.List`
         * denying everyone else. Whole section rather than per tile, since
         * every entry in it needs the same role.
         */
        isGlobalAdmin?: boolean;
        /**
         * The viewer's global roles, as casbin reports them. Shown, not acted
         * on — what any of them permits is decided by the flags above and by
         * the backend, so an empty array costs a viewer nothing but the badges.
         */
        globalRoles?: number[];
        /**
         * What the last Join attempt said, if it failed.
         *
         * The Join button posts to an action that translates the backend's
         * verdict — registration not open yet, already joined, private event —
         * and none of it was rendered: the form failed silently and the row
         * simply stayed where it was, which reads as a broken button.
         */
        joinError?: string;
    }

    const {
        session,
        myHackathons,
        otherHackathons,
        canCreate = false,
        isGlobalAdmin = false,
        globalRoles = [],
        joinError = '',
    }: Props = $props();
    const userName = session?.user?.name ?? 'there';

    // Most people hold no global role at all, so this is usually empty and the
    // greeting stays a greeting.
    const roleBadges = $derived(displayableGlobalRoles(globalRoles));

    // The same list the sidebar's Platform section renders, so an admin page
    // added to `platformNav` appears in both without being named twice. It is
    // also the gate: empty without the global admin role, which is what makes
    // the section vanish entirely for everyone else.
    const adminItems = $derived(platformNav({ isGlobalAdmin }));

    // Decorative thumbnails for hackathons with no image of their own. Each
    // stop is derived from a theme token and darkened rather than naming a
    // palette step, so the set retunes with the theme instead of drifting from
    // it — and so it survives the secondary/tertiary palettes being removed.
    const GRADIENTS = [
        { from: 'var(--color-accent)', to: 'color-mix(in oklab, var(--color-accent) 35%, black)' },
        { from: 'var(--color-info)', to: 'color-mix(in oklab, var(--color-info) 35%, black)' },
        {
            from: 'var(--color-success)',
            to: 'color-mix(in oklab, var(--color-success) 35%, black)',
        },
    ];

    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length]!;
    }

    function formatMeta(h: HackathonEntry): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '';
    }

    const joiningIds = new SvelteSet<string>();
</script>

<!-- Welcome Banner. Creating a hackathon rides here rather than beside "Your
     hackathons": it is the one action on this page that makes a new one rather
     than acting on the lists below. -->
<div class="flex flex-wrap items-start justify-between gap-4 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <!-- Roles ride beside the name rather than in the count line below: they
             qualify the person, not their hackathons, and this is the one place
             on the page that names the viewer at all. Absent for most people,
             who hold no global role — the row then collapses to just the name.

             `badge-accent` on Admin is the theme's one sanctioned accent that is
             not an action: accent may mean "your role here", and these are tonal
             rather than solid, so Create Hackathon opposite keeps the view's
             single solid accent to itself. -->
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-display">Welcome back, {userName}</h1>
            {#if roleBadges.length > 0}
                <div class="flex flex-wrap gap-1">
                    <!-- Badges alone read as decoration out of context; this says
                         whose roles they are for a screen reader. -->
                    <span class="sr-only">Your roles:</span>
                    {#each roleBadges as role (role)}
                        <!-- The label is always defined: displayableGlobalRoles
                             only returns roles this build can name. -->
                        <span class="badge {globalRoleBadgeVariant(role) ?? 'badge-neutral'}">
                            {globalRoleLabel(role)}
                        </span>
                    {/each}
                </div>
            {/if}
        </div>
        <p class="text-sm text-ink-3">
            You are connected to {myHackathons.length} hackathon{myHackathons.length === 1 ? '' : 's'}
        </p>
    </div>

    {#if canCreate}
        <a
            href={resolve('/(app)/hackathons/create')}
            class="btn btn-sm btn-solid no-underline"
        >
            <Plus class="h-4 w-4" />
            Create Hackathon
        </a>
    {/if}
</div>

<!-- Body -->
<div class="px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-6">

        <!-- Your hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-section">Your hackathons</h2>

            {#if myHackathons.length === 0}
                <p class="text-sm text-ink-3">You are not connected to any hackathons yet.</p>
            {:else}
                <div class="card overflow-hidden">
                    {#each myHackathons as h, i (h.id)}
                        {@const mem = h.viewerMembership}
                        <div class="flex items-center">
                            <div class="flex-1">
                                <!-- Member of this one: straight to the member view. -->
                                <HackathonRow
                                    href="/my/hackathon/{h.id}/overview"
                                    name={h.name}
                                    meta={formatMeta(h)}
                                    badge={statusLabel(h.status)}
                                    badgeVariant={statusBadgeVariant(h.status)}
                                    gradFrom={gradient(i).from}
                                    gradTo={gradient(i).to}
                                    logo={h.logo}
                                />
                            </div>
                            <div class="mr-4 flex shrink-0 items-center gap-2">
                                {#if mem}
                                    <span class="badge {membershipBadgeVariant(mem.isWaiting)}">
                                        {membershipBadgeLabel(mem.isWaiting, mem.role)}
                                    </span>
                                {/if}
                                {#if canEditHackathon(mem, isGlobalAdmin)}
                                    <a
                                        href={resolve(`/my/hackathon/${h.id}/edit`)}
                                        aria-label="Edit {h.name}"
                                        class="btn-icon btn-sm preset-tonal-surface"
                                    >
                                        <Pencil class="h-4 w-4" />
                                    </a>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Other hackathons -->
        <section class="flex flex-col gap-4">
            <h2 class="text-section">Other hackathons</h2>

            {#if joinError}
                <!-- A refusal reads as a broken button unless it is shown. Not
                     per row: the action posts one hackathon at a time and the
                     message names what happened, not which row. -->
                <p class="m-0 text-sm text-warning-ink" role="alert">{joinError}</p>
            {/if}

            {#if otherHackathons.length === 0}
                <p class="text-sm text-ink-3">No other hackathons available.</p>
            {:else}
                <div class="card overflow-hidden">
                    {#each otherHackathons as h, i (h.id)}
                        <div class="flex items-center border-b border-line last:border-0">
                            <div class="flex-1">
                                <!-- Not a member: the public page is the only view open to us. -->
                                <HackathonRow
                                    href="/hackathon/{h.id}"
                                    name={h.name}
                                    meta={formatMeta(h)}
                                    badge={statusLabel(h.status)}
                                    badgeVariant={statusBadgeVariant(h.status)}
                                    gradFrom={gradient(i).from}
                                    gradTo={gradient(i).to}
                                    logo={h.logo}
                                />
                            </div>
                            <form
                                method="POST"
                                action="?/join"
                                use:enhance={() => {
                                    joiningIds.add(h.id);
                                    return async ({ update }) => {
                                        await update();
                                        joiningIds.delete(h.id);
                                    };
                                }}
                            >
                                <input type="hidden" name="hackathonId" value={h.id} />
                                <button
                                    type="submit"
                                    disabled={joiningIds.has(h.id)}
                                    class="mr-4 btn btn-sm btn-accent shrink-0"
                                >
                                    {joiningIds.has(h.id) ? 'Joining…' : 'Join'}
                                </button>
                            </form>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Platform administration. Last because scope widens downwards, the
             order the sidebar already reads in: the hackathons you are in, then
             all of them, then the platform itself.

             Admin-only, and absent rather than disabled for everyone else:
             `adminItems` is empty without the global role, so a non-admin gets
             no tiles, no heading and no empty container — nothing here hints
             the pages exist. The backend refuses them regardless; this only
             decides whether to offer them.

             Headed like the two sections above it, and in the same `text-section`
             role, so the three read as peers rather than the last one being an
             afterthought bolted to the foot of the page. "Platform" rather than
             "hackathons": this is the one section that is not about them, which
             is the whole reason it is separate.

             Tiles rather than rows: unlike the two lists above, these are fixed
             destinations that want a line of explanation each, and the grid has
             room to grow as more settings pages land. Tonal `info` throughout,
             never accent — Create Hackathon above is the view's one solid
             accent, and a role is not a status. -->
        {#if adminItems.length > 0}
            <section class="flex flex-col gap-4">
                <h2 class="text-section">Manage platform</h2>

                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {#each adminItems as item (item.id)}
                        {#if item.href}
                            <!-- eslint-disable svelte/no-navigation-without-resolve -- these
                                 hrefs are built with resolve() in $lib/navigation; the rule
                                 only recognizes a literal resolve() call in the attribute. -->
                            <a
                                href={item.href}
                                class="card group flex flex-col gap-3 p-4 no-underline
                                       transition-colors hover:border-line-strong"
                            >
                                {@render tile(item, true)}
                            </a>
                            <!-- eslint-enable svelte/no-navigation-without-resolve -->
                        {:else}
                            <!-- Same treatment the sidebar gives an hrefless entry: shown,
                                 muted, and plainly not clickable. -->
                            <div
                                title="Not available yet"
                                class="card flex cursor-not-allowed flex-col gap-3 p-4
                                       opacity-50"
                            >
                                {@render tile(item, false)}
                            </div>
                        {/if}
                    {/each}
                </div>
            </section>
        {/if}
    </div>
</div>

<!-- Shared by the link and the stub above so the two cannot drift apart. The
     arrow is the only difference: on a tile that goes nowhere it would promise
     a destination there isn't one of. -->
{#snippet tile(item: NavItem, linked: boolean)}
    {@const Icon = item.icon}
    <div class="flex items-center gap-3">
        <span
            class="flex size-9 shrink-0 items-center justify-center rounded-field
                   bg-info/10 text-info-ink"
            aria-hidden="true"
        >
            <Icon class="h-4 w-4" />
        </span>
        <!-- A heading rather than a span, following ProjectCard: the base layer
             gives h1–h6 the mono face, which is where a scanned label belongs,
             and a span would quietly come out in sans. h3 because the section
             deliberately has no h2 of its own. -->
        <h3 class="m-0 flex-1 text-sm leading-snug text-ink">{item.label}</h3>
        {#if linked}
            <ArrowRight
                class="h-4 w-4 shrink-0 text-ink-3 transition-transform
                       group-hover:translate-x-0.5"
                aria-hidden="true"
            />
        {/if}
    </div>
    {#if item.description}
        <!-- The one genuinely prose-shaped thing on the tile, so it takes the
             sans face and `ink-2`, as ProjectCard's description does. -->
        <p class="prose m-0 text-xs leading-snug text-ink-2">{item.description}</p>
    {/if}
{/snippet}
