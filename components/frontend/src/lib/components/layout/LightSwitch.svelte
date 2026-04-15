<script lang="ts">
    import { Sun, Moon } from 'lucide-svelte';

    let checked = $state(false);

    $effect(() => {
        const stored = localStorage.getItem('mode') || 'dark';
        checked = stored === 'dark';
    });

    function toggle() {
        const mode = checked ? 'light' : 'dark';
        document.documentElement.setAttribute('data-mode', mode);
        localStorage.setItem('mode', mode);
        checked = !checked;
    }
</script>

<svelte:head>
    <script>
        document.documentElement.setAttribute('data-mode', localStorage.getItem('mode') || 'dark');
    </script>
</svelte:head>

<button
    onclick={toggle}
    aria-label="Toggle light/dark mode"
    class="btn-icon btn-sm hover:preset-tonal-secondary"
>
    {#if checked}
        <Sun class="h-4 w-4" />
    {:else}
        <Moon class="h-4 w-4" />
    {/if}
</button>
