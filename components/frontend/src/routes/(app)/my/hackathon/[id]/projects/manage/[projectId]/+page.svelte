<script lang="ts">
    import ProjectDetail from '$lib/components/hackathon/ProjectDetail.svelte';
    import ProjectReview from '$lib/components/hackathon/ProjectReview.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Closed until asked for. Rejecting is the one decision on this page and the
    // only destructive one, so it is a step someone takes on purpose rather than
    // a textarea sitting open under every proposal they read.
    let rejecting = $state(false);
</script>

<!-- Same component as the participant detail route, so a project reads
     identically to both audiences. What differs is the way back — to the queue
     this was opened from, where the one-click decisions are — and the two
     sections below, which only an organiser gets. -->
<ProjectDetail
    project={data.project}
    backHref={`/my/hackathon/${data.hackathonId}/projects/manage`}
    backLabel="Back to Manage Projects"
>
    {#if data.review}
        <ProjectReview review={data.review} />
    {/if}

    {#if data.mayReject}
        <section class="flex flex-col gap-2">
            {#if form?.message}
                <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
            {/if}

            {#if rejecting}
                <form method="POST" action="?/reject" class="flex flex-col gap-2">
                    <!-- Optional, and labelled so: `review_comment` is an
                         optional field and a rejection without one is a complete
                         rejection. Saying "optional" here is what stops the empty
                         box reading as a blocked form.

                         A plain textarea rather than the MarkdownEditor the
                         description uses: `ProjectReview` renders a reason as
                         plain text, so offering markdown here would promise
                         formatting that never arrives. -->
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
                <!-- No Approve beside it: approving needs nothing typed and is one
                     click on the queue, which is also where a rejection is taken
                     back. This page holds the one action that needs prose. -->
                <button
                    type="button"
                    onclick={() => (rejecting = true)}
                    class="btn btn-sm btn-danger w-fit"
                >
                    Reject
                </button>
            {/if}
        </section>
    {/if}
</ProjectDetail>
