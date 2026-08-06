<script lang="ts">
    import { capabilityHref, capabilityLabel, isComing, isOpen } from '$lib/utils/capabilityLinks';

    /**
     * What a participant can do in this hackathon right now.
     *
     * Adapted from main. The gap it fills: our overview told people about the
     * event — dates, description, their team — and nothing about the one thing
     * they came to find out, which is whether the thing they want to do is open
     * yet. Capability state existed and was rendered nowhere a member could see.
     *
     * Every open capability is a LINK to the page that exercises it, because a
     * card that says "you can propose a project" and leaves you to find the page
     * has done half a job.
     *
     * Raw numbers rather than the generated enum: this is a component, and
     * `$lib/server/**` is server-only.
     */
    let {
        hackathonId,
        capabilities = [],
        currentPhaseName = '',
    }: {
        hackathonId: string;
        /** As `Hackathon.capabilities` arrives: `{ capability, state, opensAt? }`. */
        capabilities?: { capability: number; state: number; opensAt?: Date }[];
        currentPhaseName?: string;
    } = $props();

    // Named ones only. A capability this build has no label for is one the UI
    // does not understand, and guessing a name for it would be worse than
    // leaving it out.
    const named = $derived(
        capabilities.filter((c) => capabilityLabel(c.capability) !== undefined)
    );
    const open = $derived(named.filter((c) => isOpen(c.state)));
    const coming = $derived(named.filter((c) => isComing(c.state)));

    function when(d: Date | undefined): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
        });
    }
</script>

<section class="card flex flex-col gap-3 p-5">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-section text-ink">Right now</h2>
        {#if currentPhaseName}
            <span class="badge badge-info">{currentPhaseName}</span>
        {/if}
    </div>

    {#if open.length === 0 && coming.length === 0}
        <!-- No capability rows at all means nobody has scheduled anything, which
             the backend reads as "permitted". Saying "nothing is open" would be
             a lie; saying nothing at all is honest. -->
        <p class="m-0 text-sm text-ink-3">
            This event has not published a schedule. Everything the organisers have set
            up is available from the menu.
        </p>
    {:else}
        {#if open.length > 0}
            <div class="flex flex-col gap-1">
                <span class="field-label">You can now</span>
                <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                    {#each open as c (c.capability)}
                        {@const href = capabilityHref(hackathonId, c.capability)}
                        <li>
                            {#if href}
                                <a href={href} class="btn btn-sm no-underline">
                                    {capabilityLabel(c.capability)} →
                                </a>
                            {:else}
                                <span class="badge badge-success">
                                    {capabilityLabel(c.capability)}
                                </span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if coming.length > 0}
            <!-- "Not yet" and "no longer" are different answers, and a
                 participant planning their day needs the difference. Closed
                 capabilities are left out entirely: what is over is not news. -->
            <div class="flex flex-col gap-1">
                <span class="field-label">Not open yet</span>
                <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                    {#each coming as c (c.capability)}
                        <li>
                            <span class="badge badge-warning">
                                {capabilityLabel(c.capability)}{c.opensAt
                                    ? ` — ${when(c.opensAt)}`
                                    : ''}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}
    {/if}
</section>
