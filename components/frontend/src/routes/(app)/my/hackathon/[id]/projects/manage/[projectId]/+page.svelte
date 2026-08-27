<script lang="ts">
    import ProjectDetail from '$lib/components/hackathon/ProjectDetail.svelte';
    import ProjectReview from '$lib/components/hackathon/ProjectReview.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Closed until asked for, unlike Approve. Rejecting is the one decision that
    // takes something typed, so the box appears when it is wanted rather than
    // sitting open under every proposal an organiser reads.
    let rejecting = $state(false);
</script>

<!--
  Same component as the participant detail route, so a project reads identically
  to both audiences. What differs is the way back — to the slice of the queue it
  was opened from — and the decision block below, which only an organiser gets.

  Every decision on a project is here. Two are offered at a time: the two states
  it is not already in (see +page.server.ts). Each one returns to the queue,
  where the row will have moved.
-->
<ProjectDetail
    project={data.project}
    backHref={`/my/hackathon/${data.hackathonId}/projects/manage`}
    backQuery={data.queueQuery}
    backLabel="Back to Manage Projects"
>
    {#if data.review}
        <ProjectReview review={data.review} />
    {/if}

    <section class="flex flex-col gap-3">
        <h2 class="m-0 meta">Decision</h2>

        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        {#if rejecting}
            <!-- Only the reject form while it is open: the reason is being
                 written about this project, and leaving Approve live beside a
                 half-typed rejection invites the wrong click. Cancel brings the
                 others back. -->
            <form method="POST" action="?/reject" class="flex flex-col gap-2">
                <!-- Optional, and labelled so: `review_comment` is an optional
                     field and a rejection without one is a complete rejection.
                     Saying "optional" here is what stops the empty box reading as
                     a blocked form.

                     A plain textarea rather than the MarkdownEditor the
                     description uses: `ProjectReview` renders a reason as plain
                     text, so offering markdown here would promise formatting
                     that never arrives. -->
                <label class="field-label max-w-[52ch]">
                    Reason (optional)
                    <textarea
                        name="reason"
                        rows="4"
                        maxlength="2000"
                        placeholder="What the proposer should know. They will see this on their project."
                        class="field field-area"
                    ></textarea>
                </label>
                <div class="flex flex-wrap items-center gap-2">
                    <button type="submit" class="btn btn-sm btn-danger">
                        Reject this project
                    </button>
                    <button
                        type="button"
                        onclick={() => (rejecting = false)}
                        class="btn btn-sm btn-ghost"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        {:else}
            <!-- Constructive first, destructive last, at every status — so the
                 button in a given position does not change meaning as an
                 organiser works down the queue. -->
            <div class="flex flex-wrap items-center gap-2">
                {#if data.mayApprove}
                    <form method="POST" action="?/approve">
                        <button type="submit" class="btn btn-sm btn-solid">
                            Approve
                        </button>
                    </form>
                {/if}
                {#if data.mayReturnToQueue}
                    <form method="POST" action="?/disapprove">
                        <button type="submit" class="btn btn-sm btn-warning">
                            {data.returnLabel}
                        </button>
                    </form>
                {/if}
                {#if data.mayReject}
                    <button
                        type="button"
                        onclick={() => (rejecting = true)}
                        class="btn btn-sm btn-danger"
                    >
                        Reject
                    </button>
                {/if}
            </div>
        {/if}
    </section>
</ProjectDetail>
