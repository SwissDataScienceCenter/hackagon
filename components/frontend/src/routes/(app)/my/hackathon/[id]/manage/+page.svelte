<script lang="ts">
    import { ArrowRight } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import CapabilitiesPanel from '$lib/components/hackathon/CapabilitiesPanel.svelte';
    import { manageNav } from '$lib/navigation/items';
    import { formatPhaseRange } from '$lib/utils/phase';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const state = $derived(data.hackathonState);

    // The other organiser destinations, minus this page. Read from `manageNav`
    // rather than listed again here, so an entry added to the sidebar reaches
    // these tiles too and is never described in two places.
    const shortcuts = $derived(
        manageNav(data.hackathonId, data.myMembership ?? undefined, data.isGlobalAdmin).filter(
            (i) => i.id !== 'manage:hackathon'
        )
    );

    // "Advance to Judging" when a phase is running, "Make Kickoff current" when
    // none is — the same button either way, since both are one `SetCurrentPhase`
    // writing the pointer forward.
    const advanceLabel = $derived(
        state.currentPhase ? `Advance to ${state.nextPhase?.name}` : `Make ${state.nextPhase?.name} current`
    );
</script>

<!--
  The organiser's overview, as against /overview, which is the member's. The two
  are deliberately different pages: a participant wants to know what they may do,
  an organiser wants to change it, and one page serving both was what put the
  capability switches three clicks deep inside Manage Timeline.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Manage Hackathon</h2>
        <span class="text-xs text-ink-3">
            What participants may do, and where the hackathon is now.
        </span>
    </div>

    <!-- The phase pointer. Its own box above the switches, because the two are
         genuinely independent: advancing grants nobody anything, and that is the
         single most surprising thing about this screen. -->
    <section class="card flex flex-col gap-3 border-line-strong px-5 py-4">
        <div class="flex flex-col gap-1">
            <span class="meta">Current phase</span>
            {#if state.currentPhase}
                <h3 class="m-0 text-section text-ink">{state.currentPhase.name}</h3>
                <span class="tnum text-xs text-accent-ink">
                    {formatPhaseRange(state.currentPhase.startsAt, state.currentPhase.endsAt)}
                </span>
            {:else}
                <p class="m-0 text-sm text-ink-3">
                    No phase is declared current, so the timeline follows the dates alone.
                </p>
            {/if}
        </div>

        <p class="m-0 text-xs text-ink-3">
            Moving between phases never changes what participants can do — that is the
            panel below, and it is always explicit.
        </p>

        <div class="flex flex-wrap items-center gap-2">
            {#if state.nextPhase}
                <!-- The one solid action on this page: it is what an organiser
                     comes here to do at a phase boundary. -->
                <form method="POST" action="?/setCurrent">
                    <input type="hidden" name="phaseId" value={state.nextPhase.id} />
                    <button type="submit" class="btn btn-sm btn-solid">
                        {advanceLabel}
                        <ArrowRight class="h-3 w-3 shrink-0" aria-hidden="true" />
                    </button>
                </form>
            {/if}
            {#if state.currentPhase}
                <!-- Clearing sends no phaseId, which the action reads as "clear". -->
                <form method="POST" action="?/setCurrent">
                    <button type="submit" class="btn btn-sm btn-ghost text-xs">
                        Clear current phase
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
