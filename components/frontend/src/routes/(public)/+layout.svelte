<script lang="ts">
    // The shell (top bar, page, footer) is AppShell — shared with the (app)
    // group, so the two halves of the site cannot drift apart again. They did:
    // only this group mounted the footer, which left the Privacy/Terms/About
    // links unreachable from every signed-in page.
    import AppShell from '$lib/components/layout/AppShell.svelte';

    const { children, data } = $props();
</script>

<AppShell session={data.session ?? null}>
    {@render children()}
</AppShell>
