<script lang="ts">
    import { ArrowRight, Pencil, Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import CapabilitiesPanel from '$lib/components/hackathon/CapabilitiesPanel.svelte';
    import { manageNav } from '$lib/navigation/items';
    import { canEditHackathon } from '$lib/utils/hackathonRole';
    import { isPrivate } from '$lib/utils/hackathonStatus';
    import { formatPhaseRange } from '$lib/utils/phase';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const state = $derived(data.hackathonState);

    // Its own check rather than this page's own gate, which is the broader
    // owner-or-admin: `hackathon:write` also wants the owner confirmed, so a
    // waitlisted owner reaches this page and would land on a 403 in the form.
    // The backend decides either way; this only decides whether to offer it.
    const mayEdit = $derived(canEditHackathon(data.myMembership ?? undefined, data.isGlobalAdmin));

    // The other organiser destinations, minus this page. Read from `manageNav`
    // rather than listed again here, so an entry added to the sidebar reaches
    // these tiles too and is never described in two places.
    //
    // Approving is the organiser action most easily forgotten, because nothing
    // about a waitlisted participant is visible from anywhere else — so the count
    // rides on the tile that leads to it rather than in a band of its own. These
    // are the numbers on this page that ask for something to be done, hence the
    // same warning variant as the "!" this page's own sidebar entry carries.
    //
    // A band of counts was tried on the member overview and taken back out: that
    // page is participant-shaped for every viewer, and an organiser's queue has no
    // business on it. Here each count sits on the tile that clears it.
    // Proposals behave the same way and for the same reason: a proposed project is
    // invisible from everywhere else, so its count rides the tile that reviews it.
    const queueBadges: Record<string, string> = $derived({
        // On the Waitlist tile rather than Manage Participants: those people are
        // no longer on that page at all, so the count now rides the tile that
        // actually lists them and offers Approve.
        ...(data.waitingCount > 0 ? { 'manage:waitlist': `${data.waitingCount} waiting` } : {}),
        ...(data.proposedCount > 0
            ? { 'manage:projects': `${data.proposedCount} to review` }
            : {}),
    });

    const shortcuts = $derived(
        manageNav(
            data.hackathonId,
            data.myMembership ?? undefined,
            data.isGlobalAdmin,
            false,
            data.tracks.length,
            isPrivate(data.visibility),
        )
            .filter((i) => i.id !== 'manage:settings')
            .map((i) =>
                queueBadges[i.id]
                    ? { ...i, badge: queueBadges[i.id], badgeVariant: 'badge-warning' }
                    : i
            )
    );

    // The one phase action, and which phase it writes. All three cases are the
    // same `SetCurrentPhase`; what differs is what is actually being offered,
    // which a single "Advance to X" label collapsed into one:
    //
    //  - a phase is declared → move the marker on to the one after it.
    //  - the dates say one is running but nobody declared it → declare *that* one.
    //    Advancing from a marker that does not exist skips the live phase.
    //  - nothing current → start at the first phase still to come, which is what
    //    `currentAndNextPhase` already returns as `next`.
    const phaseAction = $derived.by(() => {
        if (state.declared) {
            return state.nextPhase
                ? { phaseId: state.nextPhase.id, label: `Advance to ${state.nextPhase.name}` }
                : undefined;
        }
        if (state.currentPhase) {
            return {
                phaseId: state.currentPhase.id,
                label: `Declare ${state.currentPhase.name} current`,
            };
        }
        return state.nextPhase
            ? { phaseId: state.nextPhase.id, label: `Start ${state.nextPhase.name}` }
            : undefined;
    });

</script>

<!--
  The organiser's overview, as against /overview, which is the member's. The two
  are deliberately different pages: a participant wants to know what they may do,
  an organiser wants to change it, and one page serving both was what put the
  capability switches three clicks deep inside Manage Timeline.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- Editing the hackathon's own record — name, dates, visibility, logo,
         description — rides in the heading rather than among the tiles below:
         those lead to the things *inside* a hackathon, this one changes the
         hackathon itself, which is what this page is named after. Outline, not
         solid: advancing the phase below is this view's one solid action. -->
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">Settings</h2>
            <span class="text-xs text-ink-3">
                What participants may do, where the hackathon is now, and how its
                projects are grouped.
            </span>
        </div>
        {#if mayEdit}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/manage/edit`)}
                class="btn btn-sm btn-outline no-underline"
            >
                <Pencil class="h-3 w-3 shrink-0" aria-hidden="true" />
                Edit details
            </a>
        {/if}
    </div>

    <!-- The phase marker. Its own box above the switches, because the two are
         genuinely independent: advancing grants nobody anything, and that is the
         single most surprising thing about this screen.

         Now and Next side by side because the button moves the marker from the
         left box to the right one — its label used to name a phase that appeared
         nowhere else on the page. -->
    <section class="card flex flex-col gap-3 border-line-strong px-5 py-4">
        <span class="meta">Where the hackathon is</span>

        <div class="grid gap-2 sm:grid-cols-2">
            <div class="card card-raised flex flex-col gap-1 px-4 py-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <span class="meta">Now</span>
                    <!-- Declared, or merely running by the calendar. Named apart
                         here and nowhere else: this is the one screen where the
                         difference is actionable, since only a declaration can be
                         cleared. -->
                    {#if state.currentPhase}
                        <span class="badge {state.declared ? 'badge-info' : 'badge-neutral'}">
                            {state.declared ? 'Declared' : 'By dates'}
                        </span>
                    {/if}
                </div>
                {#if state.currentPhase}
                    <h3 class="m-0 text-section text-ink">{state.currentPhase.name}</h3>
                    <span class="tnum text-xs text-accent-ink">
                        {formatPhaseRange(state.currentPhase.startsAt, state.currentPhase.endsAt)}
                    </span>
                {:else}
                    <p class="m-0 text-sm text-ink-3">Nothing running</p>
                    <span class="text-xs text-ink-3">
                        No phase is current and no dates cover today.
                    </span>
                {/if}
            </div>

            <div class="card card-raised flex flex-col gap-1 px-4 py-3">
                <span class="meta">Next</span>
                {#if state.nextPhase}
                    <h3 class="m-0 text-section text-ink-2">{state.nextPhase.name}</h3>
                    <span class="tnum text-xs text-ink-3">
                        {formatPhaseRange(state.nextPhase.startsAt, state.nextPhase.endsAt)}
                    </span>
                {:else}
                    <p class="m-0 text-sm text-ink-3">Nothing after this</p>
                    <span class="text-xs text-ink-3">
                        Add a phase on Manage Timeline to carry on.
                    </span>
                {/if}
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            {#if phaseAction}
                <!-- The one solid action on this page: it is what an organiser
                     comes here to do at a phase boundary. -->
                <form method="POST" action="?/setCurrent">
                    <input type="hidden" name="phaseId" value={phaseAction.phaseId} />
                    <button type="submit" class="btn btn-sm btn-solid">
                        {phaseAction.label}
                        <ArrowRight class="h-3 w-3 shrink-0" aria-hidden="true" />
                    </button>
                </form>
            {/if}
            <!-- Only offered against a declaration: with the marker unset the Now
                 box comes from the dates, and clearing would post a change that
                 leaves the page looking exactly as it did. -->
            {#if state.declared}
                <!-- Clearing sends no phaseId, which the action reads as "clear". -->
                <form method="POST" action="?/setCurrent">
                    <button type="submit" class="btn btn-sm btn-quiet text-xs">
                        Clear the marker
                    </button>
                </form>
            {/if}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
                class="text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                All phases →
            </a>
        </div>

        <p class="m-0 text-xs text-ink-3">
            This only moves the marker. What participants are allowed to do is the panel
            below, and it never changes on its own.
        </p>
    </section>

    <!-- The switches, and the plan-vs-reality warning that belongs beside them
         because the fix is one of them. -->
    <CapabilitiesPanel
        currentPhaseName={state.currentPhase?.name ?? ''}
        hasState={state.hasState}
        capabilities={data.capabilityStates}
        unmet={state.unmet}
        message={form?.message}
        saved={form?.saved ?? false}
    />

    <!-- Tracks. They are optional, which is the whole reason they are settled
         here rather than behind a permanent sidebar entry: with none defined,
         Manage Tracks is not offered at all (see `manageNav`), so this card is
         the only way to the first one — and a hackathon that never wants any
         reads that as a line of prose instead of an empty list it has to go and
         look at. Once a track exists the sidebar entry appears and this card
         steps back to a summary. -->
    <section class="card flex flex-col gap-3 border-line-strong px-5 py-4">
        <!-- The heading says what tracks are for and that they are optional,
             because that is the decision being offered here — with none defined
             there is otherwise nothing on the page to say what the button would
             even get you. -->
        <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="flex min-w-0 flex-col gap-1">
                <span class="meta">Tracks</span>
                <p class="m-0 text-sm text-ink-3">
                    An optional way to group projects. A hackathon runs perfectly well
                    without any.
                </p>
            </div>
            {#if data.tracks.length > 0}
                <a
                    href={resolve(`/my/hackathon/${data.hackathonId}/tracks`)}
                    class="shrink-0 text-xs font-semibold text-accent-ink no-underline
                           hover:underline"
                >
                    Manage tracks &rarr;
                </a>
            {/if}
        </div>

        {#if data.tracks.length === 0}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/tracks/new`)}
                class="btn btn-sm btn-outline w-fit no-underline"
            >
                <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
                Add a track
            </a>
        {:else}
            <div class="flex flex-wrap gap-1">
                {#each data.tracks as track (track.id)}
                    <span class="badge badge-neutral">{track.name}</span>
                {/each}
            </div>
            <p class="m-0 text-xs text-ink-3">
                Each project's track is optional too: one without a track is not a
                project missing something.
            </p>
        {/if}
    </section>

    <!-- The rest of the organiser's destinations, as tiles. The sidebar lists the
         same entries; this is the landing page for someone who came to run the
         hackathon rather than to find one screen of it. -->
    <section class="flex flex-col gap-2">
        <span class="meta">Manage</span>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each shortcuts as item (item.id)}
                {@const Icon = item.icon}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- built with
                     resolve() in $lib/navigation/items; the rule only recognizes a
                     literal resolve() call in the attribute itself. -->
                <a
                    href={item.href}
                    class="card group flex items-center gap-3 px-4 py-3 no-underline
                           hover:bg-raised"
                >
                    <span
                        class="flex size-9 shrink-0 items-center justify-center rounded-field
                               bg-info/10 text-info-ink"
                        aria-hidden="true"
                    >
                        <Icon class="h-4 w-4" />
                    </span>
                    <h3 class="m-0 flex-1 text-sm leading-snug text-ink">{item.label}</h3>
                    {#if item.badge}
                        <span class="badge shrink-0 {item.badgeVariant ?? 'badge-neutral'}">
                            {item.badge}
                        </span>
                    {/if}
                    <ArrowRight
                        class="h-4 w-4 shrink-0 text-ink-3 transition-transform
                               group-hover:translate-x-0.5"
                        aria-hidden="true"
                    />
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {/each}
        </div>
    </section>
</div>
