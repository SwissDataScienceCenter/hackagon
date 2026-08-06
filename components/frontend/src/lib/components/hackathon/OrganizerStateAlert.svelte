<script lang="ts">
    import { stateAlerts, type CapabilityRow } from '$lib/utils/hackathonState';

    /**
     * Warns an organiser when the current phase expects a capability that is
     * switched off.
     *
     * Organisers only, and shown across the whole event rather than on one
     * page: the mismatch is discovered by a participant hitting a wall, so it
     * has to be visible wherever the organiser happens to be working.
     *
     * Nothing here is a permission check — the backend decides. This is the
     * difference between the timeline's promise and the switches' reality,
     * which nobody was told about.
     */
    let {
        hackathonId,
        capabilities = [],
        currentPhaseId = undefined,
        canManage = false,
    }: {
        hackathonId: string;
        capabilities?: CapabilityRow[];
        currentPhaseId?: string;
        canManage?: boolean;
    } = $props();

    const alerts = $derived(canManage ? stateAlerts(capabilities, currentPhaseId) : []);
</script>

{#if alerts.length > 0}
    <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40
               bg-warning/10 px-4 py-2 sm:px-10 md:px-20"
        role="status"
    >
        <div class="flex min-w-0 flex-col gap-0.5">
            {#each alerts as alert (alert.capability)}
                <span class="text-xs text-warning-ink">{alert.message}</span>
            {/each}
        </div>
        <!-- Straight to the switches. An alert that describes a problem and
             leaves you to find the control is only half an alert. -->
        <a
            href="/my/hackathon/{hackathonId}/timeline"
            class="btn btn-sm shrink-0 no-underline"
        >
            Review the switches
        </a>
    </div>
{/if}
