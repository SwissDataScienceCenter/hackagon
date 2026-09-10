<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        hackathonId,
        current,
        confirmedCount,
        waitingCount,
        showWaitlist,
    }: {
        hackathonId: string;
        /** Which of the two pages is rendering this. */
        current: 'roster' | 'waitlist';
        confirmedCount: number;
        waitingCount: number;
        /** Whether this hackathon has a waitlist worth a tab. False renders
         *  nothing at all — see the comment below for why not one lone chip. */
        showWaitlist: boolean;
    } = $props();
</script>

<!--
  The two halves of participant management: the confirmed roster, and the queue
  of people asking to join. They were one list with a "Waitlisted" chip mixed
  into it, which meant the roster count included people who are not in the
  hackathon yet and the approval queue had no surface of its own.

  Links rather than buttons, so each half is a real route that can be linked to
  — Settings badges the Waitlist entry with the count and points straight at it.
  `.chip` is this theme's segmented-control vocabulary (see frontend-theme), and
  `aria-current="page"` is the accessible form of "you are here" for a link.

  Counts sit in the tabs rather than under the heading: the number an organiser
  wants is usually the one on the tab they are *not* on.

  **The whole bar disappears with the waitlist**, rather than leaving a lone
  "Participants" chip: a segmented control with one segment offers no choice and
  reads as a broken one. The roster prints its own count under its heading, so
  nothing is lost with it. `showWaitlist` is the caller's call — the waitlist
  page always passes true, because a page must not hide its own tab.
-->
{#if showWaitlist}
    <nav class="flex gap-1" aria-label="Participants">
        <a
            href={resolve(`/my/hackathon/${hackathonId}/participants/manage`)}
            aria-current={current === 'roster' ? 'page' : undefined}
            class="chip no-underline {current === 'roster' ? 'chip-active' : ''}"
        >
            Participants
            <span class="tnum">{confirmedCount}</span>
        </a>
        <a
            href={resolve(`/my/hackathon/${hackathonId}/participants/manage/waitlist`)}
            aria-current={current === 'waitlist' ? 'page' : undefined}
            class="chip no-underline {current === 'waitlist' ? 'chip-active' : ''}"
        >
            Waitlist
            <!-- Warning, not neutral: a waiting applicant is something to act on, and
                 this is the same signal the Settings tile carries. Zero shows as a
                 plain count — there is nothing to chase. -->
            {#if waitingCount > 0}
                <span class="badge badge-warning tnum">{waitingCount}</span>
            {:else}
                <span class="tnum">0</span>
            {/if}
        </a>
    </nav>
{/if}
