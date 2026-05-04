<script lang="ts">
    import '../../app.css';

    const { children } = $props();
</script>

<div class="grid grid-cols-[240px_minmax(0,1fr)_280px]">
    <main class="overflow-y-auto">
        {@render children()}
    </main>
</div>
