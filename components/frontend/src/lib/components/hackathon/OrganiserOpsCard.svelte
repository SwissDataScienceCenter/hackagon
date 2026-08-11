<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        hackathonId,
        awaitingApproval,
        proposalsToReview,
        teamsWithoutProject,
        submissionCount,
    }: {
        hackathonId: string;
        /** Members whose `is_waiting` is still set. */
        awaitingApproval: number;
        /** Projects still at `PROJECT_STATUS_PROPOSED`. */
        proposalsToReview: number;
        /** Teams carrying no `project_id`. */
        teamsWithoutProject: number;
        /** Submissions across every team, from `Team.submissions`. */
        submissionCount: number;
    } = $props();

    // Warning ink on a count only when it is a queue with something in it. A zero
    // is not a problem and a submission count is not a queue at all — colouring
    // either would spend the status hue on "everything is fine".
    const queueTone = (n: number) => (n > 0 ? 'text-warning-ink' : 'text-ink-3');
</script>

<!--
  What an organiser has to *do*, which the overview never used to say.

  Before this, an organiser landing here read a card explaining what participants
  may do and a second one telling them they are not on a team — both true, neither
  theirs to act on. Their own numbers lived behind seven separate manage pages
  with no count on any of them, so the only way to learn that five proposals were
  waiting was to go and look.

  Every tile links to the page that clears it. Deliberately counts and nothing
  else: a list of the five proposals here would be a worse version of the page it
  links to.
-->
<section class="card flex flex-col gap-4 p-5" aria-labelledby="needs-you">
    <h2 class="m-0 text-section" id="needs-you">Needs you</h2>

    <div class="grid grid-cols-2 gap-3">
        <a
            href={resolve(`/my/hackathon/${hackathonId}/participants/manage`)}
            class="flex flex-col gap-1 rounded-card bg-raised p-3 no-underline hover:bg-overlay"
        >
            <span class="tnum text-title {queueTone(awaitingApproval)}">{awaitingApproval}</span>
            <span class="text-xs text-ink-2">awaiting approval</span>
        </a>

        <a
            href={resolve(`/my/hackathon/${hackathonId}/projects/manage`)}
            class="flex flex-col gap-1 rounded-card bg-raised p-3 no-underline hover:bg-overlay"
        >
            <span class="tnum text-title {queueTone(proposalsToReview)}">{proposalsToReview}</span>
            <span class="text-xs text-ink-2">proposals to review</span>
        </a>

        <a
            href={resolve(`/my/hackathon/${hackathonId}/teams/manage`)}
            class="flex flex-col gap-1 rounded-card bg-raised p-3 no-underline hover:bg-overlay"
        >
            <span class="tnum text-title {queueTone(teamsWithoutProject)}"
                >{teamsWithoutProject}</span
            >
            <span class="text-xs text-ink-2">teams with no project</span>
        </a>

        <a
            href={resolve(`/my/hackathon/${hackathonId}/submissions`)}
            class="flex flex-col gap-1 rounded-card bg-raised p-3 no-underline hover:bg-overlay"
        >
            <span class="tnum text-title text-ink">{submissionCount}</span>
            <span class="text-xs text-ink-2">submissions in</span>
        </a>
    </div>
</section>
