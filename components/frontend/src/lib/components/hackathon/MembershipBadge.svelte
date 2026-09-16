<script lang="ts">
    import UserRound from 'lucide-svelte/icons/user-round';
    import { membershipBadgeLabel, membershipBadgeVariant } from '$lib/utils/hackathonRole';

    // The one chip that says something about *the reader* rather than about the
    // hackathon — Owner, Member, Waitlisted. Everything else on a row is a fact
    // about the event, so this one carries a person to set it apart at a glance,
    // and it is a component rather than three hand-rolled spans so the icon and
    // the colour cannot drift between the dashboard, the hero and the join bar.
    let {
        isWaiting = false,
        role = 0,
    }: {
        isWaiting?: boolean;
        /** Raw HackathonRole number; ignored while waiting, which outranks it. */
        role?: number;
    } = $props();
</script>

<span class="badge {membershipBadgeVariant(isWaiting)} shrink-0">
    <UserRound class="h-3 w-3 shrink-0" aria-hidden="true" />
    {membershipBadgeLabel(isWaiting, role)}
</span>
