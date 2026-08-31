<script lang="ts">
    import Sun from 'lucide-svelte/icons/sun';
    import Moon from 'lucide-svelte/icons/moon';
    import { resolveMode, storedMode } from '$lib/utils/mode';
    import type { Mode } from '$lib/utils/mode';

    let dark = $state(false);

    function read(): string | null {
        // Reading storage throws outright in some privacy configurations, not
        // just returns null, so every access is guarded.
        try {
            return localStorage.getItem('mode');
        } catch {
            return null;
        }
    }

    function apply(mode: Mode) {
        const el = document.documentElement;
        el.setAttribute('data-mode', mode);
        el.style.colorScheme = mode;
    }

    $effect(() => {
        // Feature-detected, not assumed: `matchMedia` is absent in some
        // environments (jsdom, where NavBar's own tests render this), and a
        // missing media query must not take the whole nav bar down with it.
        // Without one there is no system preference to read, so a stored choice
        // is all there is to go on.
        const query =
            typeof window.matchMedia === 'function'
                ? window.matchMedia('(prefers-color-scheme: dark)')
                : null;

        // Read back what the pre-paint script in app.html already decided rather
        // than deciding again: it may have resolved from the system preference,
        // in which case nothing is stored and storage alone would disagree with
        // what the visitor is currently looking at.
        dark = resolveMode(read(), query?.matches ?? false) === 'dark';

        if (!query) return;

        // Track the system while the visitor has expressed no preference of
        // their own — someone flipping their OS to dark at sunset should see
        // this follow. Once they press the button a value is stored, and from
        // then on this listener defers to it.
        const onChange = (e: MediaQueryListEvent) => {
            if (storedMode(read())) return;
            dark = e.matches;
            apply(e.matches ? 'dark' : 'light');
        };
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    });

    function toggle() {
        const mode: Mode = dark ? 'light' : 'dark';
        apply(mode);
        try {
            localStorage.setItem('mode', mode);
        } catch {
            // Storage blocked: the choice still applies to this page, it just
            // will not survive a reload. Better than refusing to switch.
        }
        dark = !dark;
    }
</script>

<button
    onclick={toggle}
    aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    class="btn btn-icon btn-sm btn-quiet"
>
    {#if dark}
        <Sun class="h-4 w-4" />
    {:else}
        <Moon class="h-4 w-4" />
    {/if}
</button>
