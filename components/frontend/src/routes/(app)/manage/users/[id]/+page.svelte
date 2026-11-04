<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import Lock from 'lucide-svelte/icons/lock';
    import MembershipBadge from '$lib/components/hackathon/MembershipBadge.svelte';
    import ProfileLinks from '$lib/components/hackathon/ProfileLinks.svelte';
    import InfoToggle from '$lib/components/layout/InfoToggle.svelte';
    import UserAvatar from '$lib/components/user/UserAvatar.svelte';
    import {
        ADMIN_ROLE,
        NO_PLATFORM_ROLE,
        PLATFORM_ROLE_CHOICES,
        currentPlatformRole,
        displayableGlobalRoles,
        globalRoleBadgeVariant,
        globalRoleLabel,
        platformRoleChangeConsequences,
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

    // Three deliberate steps, because one of the choices hands over every
    // hackathon on the platform: open the form, pick a role, confirm the change
    // the button names. Picking alone never submits — on Windows the arrow keys
    // fire `change` on a closed select for every option they pass.
    let editing = $state(false);
    let picked = $state<number | undefined>(undefined);
    let pending = $state(false);

    // Before any change can be confirmed, the form says what it does. Granting
    // Admin then takes a fourth step, the username typed back: it is the one
    // choice that hands over every hackathon and this page, so it should not be
    // reachable by clicking through. The action checks it again server-side.
    let confirmText = $state('');
    const needsConfirm = $derived(picked === ADMIN_ROLE);
    const confirmed = $derived(!needsConfirm || confirmText.trim() === data.user.username);

    const consequences = $derived(
        picked === undefined ? [] : platformRoleChangeConsequences(data.user.roles, picked)
    );
    const touchesAdmin = $derived(
        picked !== undefined && (picked === ADMIN_ROLE || data.user.roles.includes(ADMIN_ROLE))
    );

    // The role held is not offered as a change to itself. A user holding both
    // (`current` undefined) is offered all three, any of which settles it.
    const options = $derived(PLATFORM_ROLE_CHOICES.filter((c) => c !== current));

    const submitLabel = $derived.by(() => {
        if (picked === undefined) return 'Confirm change';
        if (picked === NO_PLATFORM_ROLE) return 'Remove platform role';
        return `Make ${platformRoleChoiceLabel(picked)}`;
    });

    function closeEditor() {
        editing = false;
        picked = undefined;
        confirmText = '';
    }

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

<div class="flex flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-3">
        <a
            href={resolve('/(app)/manage/users')}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to users
        </a>
        <div class="flex items-center gap-4">
            <UserAvatar
                displayName={data.user.displayName}
                username={data.user.username}
                size="size-14 text-sm"
            />
            <div class="flex min-w-0 flex-col gap-1">
                <h1 class="m-0 truncate text-title text-ink">{fullName}</h1>
                <p class="m-0 truncate text-xs text-ink-3">
                    @{data.user.username}{#if data.user.email}&nbsp;·&nbsp;{data.user.email}{/if}
                </p>
                <p class="m-0 text-xs text-ink-3">
                    Joined <span class="tnum">{localIsoDate(data.user.createdAt)}</span>
                </p>
                <ProfileLinks links={data.links} />
            </div>
        </div>
    </div>

    <section class="flex max-w-2xl flex-col gap-3">
        <InfoToggle label="About platform roles" topic="user-platform-role">
            {#snippet heading()}
                <h2 class="m-0 text-section">Platform role</h2>
            {/snippet}
        </InfoToggle>

        <div class="flex flex-wrap items-center gap-3">
            {#if heldRoles.length === 0}
                <span class="text-sm text-ink-2">None</span>
            {:else}
                {#each heldRoles as role (role)}
                    <span class="badge {globalRoleBadgeVariant(role) ?? 'badge-neutral'}">
                        {globalRoleLabel(role)}
                    </span>
                {/each}
            {/if}
            {#if !isSelf && !editing}
                <button type="button" onclick={() => (editing = true)} class="btn btn-sm btn-outline">
                    Change…
                </button>
            {/if}
        </div>

        <!-- State, not explanation: why the control is missing, or why the
             current role reads oddly. Either would look like a bug unsaid. -->
        {#if isSelf}
            <p class="m-0 text-xs text-ink-3">
                You can't change your own platform role. Another admin has to.
            </p>
        {:else if current === undefined}
            <p class="m-0 text-xs text-warning-ink">
                Holds both roles. Choosing one removes the other.
            </p>
        {/if}

        {#if editing}
            <form
                method="POST"
                action="?/setRole"
                use:enhance={() => {
                    pending = true;
                    return async ({ result, update }) => {
                        await update();
                        pending = false;
                        if (result.type === 'success') closeEditor();
                    };
                }}
                class="card flex flex-col gap-3 p-4"
            >
                <label class="field-label">
                    New platform role
                    <select
                        name="role"
                        disabled={pending}
                        onchange={(e) => {
                            const v = Number(e.currentTarget.value);
                            picked = Number.isNaN(v) ? undefined : v;
                            confirmText = '';
                        }}
                        class="field h-9 px-2"
                    >
                        <option value="" disabled selected>Choose a role…</option>
                        {#each options as choice (choice)}
                            <option value={choice}>{platformRoleChoiceLabel(choice)}</option>
                        {/each}
                    </select>
                </label>
                <!-- What the change does, before it can be confirmed. Danger
                     whenever Admin is gained or lost, since that moves access to
                     every hackathon; warning otherwise. -->
                {#if consequences.length > 0}
                    <div
                        class="flex flex-col gap-2 rounded-card border px-3 py-3
                               {touchesAdmin
                            ? 'border-danger/40 bg-danger/10'
                            : 'border-warning/40 bg-warning/10'}"
                        role="note"
                    >
                        <p class="m-0 font-mono text-xs font-semibold text-ink">
                            What changes for {fullName}
                        </p>
                        <ul class="m-0 flex list-disc flex-col gap-1 pl-4 font-sans text-xs text-ink-2">
                            {#each consequences as line (line)}
                                <li>{line}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
                {#if needsConfirm}
                    <label class="field-label">
                        <span>Type <code class="text-ink">{data.user.username}</code> to confirm</span>
                        <input
                            name="confirm"
                            bind:value={confirmText}
                            disabled={pending}
                            autocomplete="off"
                            spellcheck="false"
                            class="field h-9 px-2"
                        />
                    </label>
                {/if}
                <div class="flex flex-wrap items-center gap-2">
                    <button
                        type="submit"
                        disabled={pending || picked === undefined || !confirmed}
                        class="btn btn-sm {touchesAdmin || picked === NO_PLATFORM_ROLE
                            ? 'btn-danger'
                            : 'btn-warning'}"
                    >
                        {submitLabel}
                    </button>
                    <button type="button" onclick={closeEditor} class="btn btn-sm btn-quiet">
                        Cancel
                    </button>
                </div>
            </form>
        {/if}

        {#if form?.message}
            <p
                class="m-0 text-xs {form.success ? 'text-success-ink' : 'text-danger-ink'}"
                role={form.success ? 'status' : 'alert'}
            >
                {form.message}
            </p>
        {/if}
    </section>

    <section class="flex flex-col gap-3">
        <InfoToggle label="About hackathon roles" topic="user-hackathon-roles">
            {#snippet heading()}
                <h2 class="m-0 text-section">
                    Hackathons <span class="tnum text-ink-3">{data.hackathons.length}</span>
                </h2>
            {/snippet}
        </InfoToggle>
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
                        <col class="w-32" />
                        <col class="w-28" />
                        <!-- Zero on a phone, where its cells are hidden, so the
                             name gets the width back. -->
                        <col class="w-0 sm:w-56" />
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
