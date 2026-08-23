<script lang="ts">
    import { resolve } from '$app/paths';

    let { hackathonId }: { hackathonId: string } = $props();
</script>

<!-- The way back to the organiser hub from a manage index — Settings, which
     is what the hub page is called; "Manage Hackathon" is the sidebar section
     holding all of these. Organiser screens only: member pages stay free of
     owner chrome. -->
<a
    href={resolve(`/my/hackathon/${hackathonId}/manage`)}
    class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
>
    &larr; Settings
</a>
