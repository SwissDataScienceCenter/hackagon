<script lang="ts">
    // No header/footer in the app shell — authenticated chrome (sidebar,
    // hackathon switcher) lands in the left column instead. The row layout is
    // already in place so the sidebar can slot in without reshaping this file.
    const { children } = $props();
</script>

<div class="flex min-h-screen flex-col md:flex-row">
    <main class="flex-1 overflow-y-auto">
        {@render children()}
    </main>
</div>
