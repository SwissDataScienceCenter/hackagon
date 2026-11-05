<script lang="ts">
    import Lock from 'lucide-svelte/icons/lock';

    let {
        hackathonName,
        isPrivate = false,
        section,
    }: {
        hackathonName: string;
        isPrivate?: boolean;
        /**
         * The label of the sidebar entry that is lit, as the layout found it.
         * Undefined on a route no entry claims, and the trail then ends at the
         * hackathon.
         */
        section?: string;
    } = $props();
</script>

<!--
  Where the reader is: <this hackathon> / <section>.

  The hackathon's name used to sit in the sidebar header, cut off at 16rem,
  and was gone once the sidebar was folded to its rail or shut on a phone. It
  lives here now and nowhere else in the member area: this bar sits at the top
  of the content column, so it is there whatever the sidebar is doing, with
  room for the whole name.

  The section is the entry the sidebar lights, so the two never disagree.

  A statement, not a way around. No part is a link: the name had nowhere
  right to lead — Overview is the participant side, so an organiser on a
  Manage page was sent out of their own section — and the section's link is
  the sidebar entry beside it. The back link on a detail page stays: it says
  where the reader came from, this says where they are.

  Sticky under the 3.5rem header from md, the same offset the sidebar uses. Not
  on a phone, whose header is taller and where the screen is too short to give
  a line to it permanently.
-->
<nav
    aria-label="Breadcrumb"
    class="border-b border-line bg-surface px-4 py-2 sm:px-10 md:sticky md:top-14 md:z-20
           md:px-20"
>
    <ol class="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-xs text-ink-3">
        <li class="flex min-w-0 items-center gap-1">
            <span class="min-w-0 truncate font-semibold text-ink-2">{hackathonName}</span>
            <!-- The same padlock the list rows carry, after the name it
                 qualifies. -->
            {#if isPrivate}
                <Lock class="h-3 w-3 shrink-0" aria-label="Private" />
            {/if}
        </li>
        {#if section}
            <li class="shrink-0" aria-hidden="true">/</li>
            <li class="min-w-0 truncate font-semibold text-ink" aria-current="page">
                {section}
            </li>
        {/if}
    </ol>
</nav>
