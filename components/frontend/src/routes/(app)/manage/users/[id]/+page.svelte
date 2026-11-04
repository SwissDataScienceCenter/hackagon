<script lang="ts">
    import { enhance } from '$app/forms';
    import { beforeNavigate, goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import Lock from 'lucide-svelte/icons/lock';
    import MembershipBadge from '$lib/components/hackathon/MembershipBadge.svelte';
    import ProfileLinks from '$lib/components/hackathon/ProfileLinks.svelte';
    import ConfirmDialog from '$lib/components/layout/ConfirmDialog.svelte';
    import InfoButton from '$lib/components/layout/InfoButton.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import UserAvatar from '$lib/components/user/UserAvatar.svelte';
    import {
        ADMIN_ROLE,
        PLATFORM_ROLE_CHOICES,
        currentPlatformRole,
        displayableGlobalRoles,
        globalRoleLabel,
        platformRoleChoiceLabel,
    } from '$lib/utils/globalRole';
    import { isPrivate, statusBadgeVariant, statusLabel } from '$lib/utils/hackathonStatus';
    import { localIsoDate } from '$lib/utils/localDate';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type HackathonEntry = PageData['hackathons'][number];

    const fullName = $derived(data.user.displayName || data.user.username);
    const current = $derived(currentPlatformRole(data.user.roles));
    const heldRoles = $derived(displayableGlobalRoles(data.user.roles));

    // Every change you could make on your own page removes your Admin role,
    // which `RemoveRole` refuses. Not offered rather than left to fail.
    const isSelf = $derived(data.user.id === data.currentUserId);

    // The same edit-then-save pattern as a hackathon's Settings: the select
    // shows the role held, picking another only marks the bar below as unsaved,
    // and nothing changes until Save. Picking alone never submits — on Windows
    // the arrow keys fire `change` on a closed select for every option passed.
    //
    // Derived so it snaps back to the saved role whenever the load reruns —
    // after Save, or another admin's change — and overridden locally by picking.
    let draft = $derived(current);
    let pending = $state(false);
    const dirty = $derived(draft !== undefined && draft !== current);

    // A user holding both roles (only possible through the API) has no single
    // current choice; the bar names both so the change it describes is honest.
    const currentLabel = $derived(
        current === undefined
            ? heldRoles.map((r) => globalRoleLabel(r) ?? 'Unknown').join(' + ')
            : platformRoleChoiceLabel(current)
    );
    const summary = $derived(
        dirty && draft !== undefined ? `${currentLabel} → ${platformRoleChoiceLabel(draft)}` : ''
    );

    // Granting Admin hands over every hackathon and this page, so Save asks
    // once more, in the app's standard confirm dialog. Every other change saves
    // straight away, as in Settings.
    let confirmDialog: ReturnType<typeof ConfirmDialog>;
    const grantsAdmin = $derived(draft === ADMIN_ROLE && !data.user.roles.includes(ADMIN_ROLE));

    // Same leave guard as Settings: a link inside the app never fires
    // `beforeunload`, so the router's navigation is cancelled, the question
    // asked, and on a "yes" resumed — with `leaving` set so it doesn't ask twice.
    let leaving = false;
    beforeNavigate((navigation) => {
        if (leaving || !dirty || navigation.type === 'leave') return;
        const target = navigation.to?.url;
        navigation.cancel();
        if (!target) return;

        void confirmDialog
            .ask({
                title: 'Leave without saving?',
                message: `The platform role change (${summary}) is lost if you leave.`,
                confirmLabel: 'Leave without saving',
                danger: true,
            })
            .then((leave) => {
                if (!leave) return;
                leaving = true;
                if (navigation.willUnload) window.location.href = target.href;
                // eslint-disable-next-line svelte/no-navigation-without-resolve -- the URL SvelteKit was already navigating to, resolved by whatever link started it
                else void goto(target);
            });
    });

    // Same format as the dashboard's rows, so a hackathon's dates read the same
    // wherever it is listed.
    function dates(h: HackathonEntry): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '—';
    }
</script>

<svelte:window
    onbeforeunload={(e) => {
        if (dirty && !leaving) e.preventDefault();
    }}
/>

<ConfirmDialog bind:this={confirmDialog} />

<div class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title={fullName} back={{ href: '/manage/users', label: 'Users' }}>
        {#snippet leading()}
            <UserAvatar
                displayName={data.user.displayName}
                username={data.user.username}
                size="size-14 text-sm"
            />
        {/snippet}
        {#snippet meta()}
            <p class="m-0 truncate">
                @{data.user.username}{#if data.user.email}&nbsp;·&nbsp;{data.user.email}{/if}
            </p>
            <p class="m-0">
                Joined <span class="tnum">{localIsoDate(data.user.createdAt)}</span>
            </p>
            <ProfileLinks links={data.links} />
        {/snippet}
    </PageHeader>

    <section class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
            <h2 class="m-0 text-section">Platform role</h2>
            <InfoButton topic="user-platform-role" title="Platform roles" />
        </div>

        <!-- Enhanced, so saving stays on the page: the load re-runs, the select
             snaps to what was saved, and the bar says so. -->
        <form
            method="POST"
            action="?/setRole"
            use:enhance={async ({ cancel }) => {
                if (grantsAdmin) {
                    const ok = await confirmDialog.ask({
                        title: `Make ${fullName} an Admin?`,
                        message: 'Admins have full access to every hackathon and to user management.',
                        confirmLabel: 'Make Admin',
                        danger: true,
                    });
                    if (!ok) return cancel();
                }
                pending = true;
                return async ({ update }) => {
                    await update({ reset: false });
                    pending = false;
                };
            }}
            class="flex flex-col gap-3"
        >
            <label class="sr-only" for="platform-role">Platform role for {fullName}</label>
            <!-- Warning-tinted while unsaved, the same color as the bar, as the
                 changed rows are in Settings. -->
            <select
                id="platform-role"
                name="role"
                disabled={isSelf || pending}
                onchange={(e) => (draft = Number(e.currentTarget.value))}
                class="field h-9 px-2 sm:w-72 {dirty ? 'border-warning bg-warning/10' : ''}"
            >
                {#if current === undefined}
                    <option value="" disabled selected={draft === undefined}>{currentLabel}</option>
                {/if}
                {#each PLATFORM_ROLE_CHOICES as choice (choice)}
                    <option value={choice} selected={draft === choice}>
                        {platformRoleChoiceLabel(choice)}
                    </option>
                {/each}
            </select>

            <!-- State, not explanation: why the control is locked, or why the
                 current role reads oddly. Either would look like a bug unsaid. -->
            {#if isSelf}
                <p class="m-0 text-xs text-ink-3">
                    You can't change your own platform role. Another admin has to.
                </p>
            {:else}
                {#if current === undefined}
                    <p class="m-0 text-xs text-warning-ink">
                        Holds both roles. Choosing one removes the other.
                    </p>
                {/if}
                <!-- The Settings save bar: quiet while saved, warning-colored
                     as soon as the select differs from the role held. -->
                <div
                    class="flex flex-wrap items-center gap-3 rounded-card border px-3 py-2 text-xs
                           {dirty ? 'border-warning bg-warning/10' : 'border-line bg-raised'}"
                    role="status"
                >
                    <span class="flex-1 {dirty ? 'text-warning-ink' : 'text-ink-3'}">
                        {#if pending}
                            Saving…
                        {:else if dirty}
                            Unsaved change: {summary}
                        {:else if form?.success}
                            <span class="text-success-ink">{form.message}</span>
                        {:else}
                            No unsaved changes
                        {/if}
                    </span>
                    {#if form && !form.success && !pending}
                        <span class="text-danger-ink" role="alert">{form.message}</span>
                    {/if}
                    <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        disabled={pending || !dirty}
                        onclick={() => (draft = current)}
                    >
                        Discard
                    </button>
                    <button
                        type="submit"
                        class="btn btn-sm btn-outline-accent"
                        disabled={pending || !dirty}
                    >
                        Save
                    </button>
                </div>
            {/if}
        </form>
    </section>

    <section class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
            <h2 class="m-0 text-section">
                Hackathons <span class="tnum text-ink-3">{data.hackathons.length}</span>
            </h2>
            <InfoButton topic="user-hackathon-roles" title="Hackathon roles" />
        </div>
        {#if data.hackathons.length === 0}
            <p class="m-0 text-sm text-ink-3">No hackathons yet.</p>
        {:else}
            <!-- One line per hackathon: this is an audit of where someone stands,
                 not a place to browse events, so no logos. Links always go to the
                 member Overview — the viewer is a global admin, who can open every
                 hackathon whatever their own membership. -->
            <div class="w-full overflow-hidden rounded-card border border-line">
                <table class="w-full table-fixed border-collapse text-left text-xs">
                    <colgroup>
                        <col />
                        <col class="w-28" />
                        <col class="w-28" />
                        <!-- Zero on a phone, where its cells are hidden, so the
                             name gets the width back. -->
                        <col class="w-0 sm:w-48" />
                    </colgroup>
                    <thead>
                        <tr class="border-b border-line bg-raised text-ink-3">
                            <th class="px-3 py-2 font-semibold">Hackathon</th>
                            <th class="px-3 py-2 font-semibold">Role</th>
                            <th class="px-3 py-2 font-semibold">Status</th>
                            <th class="hidden px-3 py-2 font-semibold sm:table-cell">Dates</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.hackathons as h (h.id)}
                            <tr class="border-b border-line transition-colors last:border-0 hover:bg-raised">
                                <td class="px-3 py-2">
                                    <div class="flex min-w-0 flex-col gap-0.5">
                                        <a
                                            href={resolve(`/my/hackathon/${h.id}/overview`)}
                                            title={h.name}
                                            class="inline-flex max-w-full items-center gap-1.5 font-semibold
                                                   text-ink no-underline hover:underline"
                                        >
                                            <span class="truncate">{h.name}</span>
                                            {#if isPrivate(h.visibility)}
                                                <Lock
                                                    class="h-3 w-3 shrink-0 text-ink-3"
                                                    aria-label="Private"
                                                />
                                            {/if}
                                        </a>
                                        <!-- The people who set this user's role here,
                                             each a link to their own page. -->
                                        {#if h.owners.length > 0}
                                            <span class="truncate text-ink-3">
                                                {h.owners.length === 1 ? 'Owner' : 'Owners'}:
                                                {#each h.owners as o, i (o.id)}
                                                    {#if i > 0},
                                                    {/if}
                                                    {#if o.id === data.user.id}
                                                        <span>{o.name}</span>
                                                    {:else}
                                                        <a
                                                            href={resolve(`/manage/users/${o.id}`)}
                                                            class="text-ink-2 no-underline hover:underline"
                                                        >
                                                            {o.name}
                                                        </a>
                                                    {/if}
                                                {/each}
                                            </span>
                                        {/if}
                                    </div>
                                </td>
                                <!-- A link to where the role is changed, inside the
                                     hackathon, which an admin may open like its
                                     owners. -->
                                <td class="px-3 py-2">
                                    {#if h.hasParticipantRow}
                                        <a
                                            href={resolve(
                                                `/my/hackathon/${h.id}/participants/manage/${data.user.id}`
                                            )}
                                            title="Manage {fullName} in {h.name}"
                                            class="no-underline hover:opacity-80"
                                        >
                                            <MembershipBadge isWaiting={h.isWaiting} role={h.role} />
                                        </a>
                                    {:else}
                                        <MembershipBadge isWaiting={h.isWaiting} role={h.role} />
                                    {/if}
                                </td>
                                <td class="px-3 py-2">
                                    <span class="badge {statusBadgeVariant(h.status) ?? 'badge-neutral'}">
                                        {statusLabel(h.status) ?? 'Unknown'}
                                    </span>
                                </td>
                                <td class="hidden truncate px-3 py-2 text-ink-3 tnum sm:table-cell">
                                    {dates(h)}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </section>
</div>
