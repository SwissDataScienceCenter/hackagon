<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        hackathonId,
        current,
        questionCount
    }: {
        hackathonId: string;
        /** Which of the forms is rendering this. */
        current: 'registration';
        questionCount: number;
    } = $props();
</script>

<!--
  The event's forms, one tab each. Only the registration form exists today, so
  this bar is a segmented control of one — built now rather than when the second
  form lands, because the alternative is a sidebar entry named after one form
  that later has to be renamed and its route moved out from under everyone's
  bookmarks.

  Links rather than buttons, and inline `resolve()` rather than a loop over
  pre-resolved hrefs: the same two choices `ParticipantsManageTabs` makes, for the
  same two reasons — each tab is a real address the back button understands, and
  `svelte/no-navigation-without-resolve` reads the href expression itself and
  cannot tell that a variable already holds a resolved path.

  `.chip` is this theme's segmented-control vocabulary (see frontend-theme), and
  `aria-current="page"` is the accessible form of "you are here" for a link.

  The count is plain, never a warning badge: a form with no questions is a
  legitimate state — it means joining is a single click — and not a queue anyone
  has to clear.
-->
<nav class="flex flex-wrap gap-1" aria-label="Forms">
    <a
        href={resolve(`/my/hackathon/${hackathonId}/manage/forms/registration`)}
        aria-current={current === 'registration' ? 'page' : undefined}
        class="chip no-underline {current === 'registration' ? 'chip-active' : ''}"
    >
        Registration
        <span class="tnum">{questionCount}</span>
    </a>
</nav>
