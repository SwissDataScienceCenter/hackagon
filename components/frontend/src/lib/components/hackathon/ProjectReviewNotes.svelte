<script lang="ts">
    /**
     * The review record a rejection leaves behind, read-only.
     *
     * There is no comment RPC: `ProjectService.Reject` is the only thing that
     * ever writes a `ProjectComment` — one saying "Project rejected", plus a
     * second one carrying the reason when the organiser typed one
     * (`project_service.go:249-321`). So this is a record of a decision, not a
     * thread, and there is deliberately nothing here to reply with.
     *
     * Every note is shown, the "Project rejected" one included. It reads as
     * redundant next to the badge, but `Project` carries no `rejectedBy` or
     * `rejectedAt` field — that note is the only record of *who* turned the
     * project down and *when*, so dropping it would lose the only fact this
     * section uniquely holds. Filtering it would also mean matching on a string
     * the backend is free to reword.
     *
     * Shown to whoever may already read the project: its proposer, and an
     * organiser. Nobody else can reach either detail route for a rejected
     * project, so there is no extra visibility rule here.
     */
    let {
        notes
    }: {
        notes: {
            id: string;
            /** Who wrote it. Empty when the backend had no display name. */
            author: string;
            text: string;
            createdAt?: Date;
        }[];
    } = $props();

    function on(d: Date | undefined): string | undefined {
        if (!d) return undefined;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
</script>

<!-- Oldest first: the notes are a sequence — the decision, then what was said
     about it — and reversing that would put the reason before the rejection. -->
<section class="flex flex-col gap-2">
    <h2 class="m-0 meta">Review notes</h2>
    <ol class="m-0 flex list-none flex-col gap-3 border-l border-line pl-3">
        {#each notes as note (note.id)}
            <li class="flex flex-col gap-0.5">
                <span class="text-xs text-ink-3">
                    {#if note.author}{note.author}{/if}
                    {#if note.author && on(note.createdAt)}&middot;{/if}
                    {#if on(note.createdAt)}{on(note.createdAt)}{/if}
                </span>
                <!-- Plain text, not markdown: the reason is typed into a bare
                     textarea, so rendering it as markdown would interpret
                     characters the writer meant literally. -->
                <p class="m-0 whitespace-pre-wrap text-xs leading-relaxed text-ink-2">
                    {note.text}
                </p>
            </li>
        {/each}
    </ol>
</section>
