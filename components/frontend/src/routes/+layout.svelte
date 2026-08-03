<script lang="ts">
    // Chrome lives in the (public) and (app) group layouts — the root layout only
    // loads global styles so both groups can render a completely different shell.
    import '../app.css';

    const { children } = $props();
</script>

{@render children()}
