<script lang="ts">
    /**
     * Why a project was turned down, read-only.
     *
     * There is no comment RPC: `ProjectService.Reject` is the only thing that
     * ever writes a `ProjectComment` (`project_service.go:249-321`). So this is
     * a record of a decision, not a thread, and there is deliberately nothing
     * here to reply with.
     *
     * The decision is stated once, as the line under the heading, and the
     * organiser's words sit beneath it without repeating their name and the date
     * on every one — see `projectReviewFor`, which splits the two apart.
     *
     * Shown to whoever may already read the project: its proposer, and an
     * organiser. Nobody else can reach either detail route for a rejected
     * project, so there is no extra visibility rule here.
     */
    let {
        review
    }: {
        review: {
            /** Empty when the backend held no display name for them. */
            rejectedBy: string;
            rejectedAt?: Date;
            reasons: { id: string; text: string }[];
        };
    } = $props();

    function on(d: Date | undefined): string | undefined {
        if (!d) return undefined;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Assembled here rather than in the markup because each part can be missing
    // independently, and "Rejected by · " with a gap where a name should be is
    // worse than a shorter sentence that happens to be true.
    const attribution = $derived.by(() => {
        const when = on(review.rejectedAt);
        if (review.rejectedBy && when) return `Rejected by ${review.rejectedBy} · ${when}`;
        if (review.rejectedBy) return `Rejected by ${review.rejectedBy}`;
        if (when) return `Rejected · ${when}`;
        return 'Rejected';
    });
</script>

<section class="flex flex-col gap-2">
    <h2 class="m-0 meta">Review</h2>
    <div class="flex flex-col gap-2 border-l border-line pl-3">
        <p class="m-0 text-xs text-ink-3">{attribution}</p>

        {#if review.reasons.length > 0}
            <!-- Oldest first, as written. Plain text, not markdown: the reason is
                 typed into a bare textarea, so rendering it as markdown would
                 interpret characters the writer meant literally. -->
            {#each review.reasons as reason (reason.id)}
                <p class="m-0 whitespace-pre-wrap text-xs leading-relaxed text-ink-2">
                    {reason.text}
                </p>
            {/each}
        {:else}
            <!-- The reason is optional, and a rejection without one is complete.
                 Said plainly, the same way a project with no description says so,
                 rather than leaving the reader wondering if it failed to load. -->
            <p class="m-0 text-xs text-ink-3">No reason was given.</p>
        {/if}
    </div>
</section>
