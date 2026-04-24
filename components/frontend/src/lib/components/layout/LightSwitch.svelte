<script lang="ts">
    import Sun from 'lucide-svelte/icons/sun';
    import Moon from 'lucide-svelte/icons/moon';

    let checked = $state(false);

    function applyMode(mode: 'light' | 'dark') {
        if (typeof document === 'undefined') return;
        const el = document.documentElement;
        el.setAttribute('data-mode', mode);
        el.style.colorScheme = mode === 'dark' ? 'dark' : 'light';
    }

    $effect(() => {
        if (typeof localStorage === 'undefined') return;
        const stored = (localStorage.getItem('mode') || 'dark') as 'light' | 'dark';
        checked = stored === 'dark';
        applyMode(stored);
    });

    function toggle() {
        const mode = checked ? 'light' : 'dark';
        applyMode(mode);
        localStorage.setItem('mode', mode);
        checked = !checked;
    }
</script>

<svelte:head>
    <script>
        (function () {
            const m = (localStorage.getItem('mode') || 'dark');
            const el = document.documentElement;
            el.setAttribute('data-mode', m);
            el.style.colorScheme = m === 'dark' ? 'dark' : 'light';
        })();
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
