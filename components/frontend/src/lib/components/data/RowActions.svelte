<script lang="ts">
    import { MoreHorizontal } from 'lucide-svelte';
    import type { Snippet } from 'svelte';

    // Per-row actions as a dropdown, so a table row stays one line however many
    // things you can do to it.
    //
    // A native <details>, like the account menu: it opens on the first click
    // even before the page has hydrated. `menuOpen` mirrors the element rather
    // than driving it — a two-way bind:open re-closes a menu that was opened
    // pre-hydration.

    let { label = 'Actions', children }: { label?: string; children: Snippet } = $props();

    let menuEl: HTMLDetailsElement | undefined = $state();
    let menuOpen = $state(false);

    const syncOpen = () => (menuOpen = menuEl?.open ?? false);

    function closeMenu() {
        if (menuEl) menuEl.open = false;
        menuOpen = false;
    }

    $effect(() => {
        syncOpen();
    });
</script>

<details class="relative inline-block text-left" bind:this={menuEl} ontoggle={syncOpen}>
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <!-- Explicit for the same reason as the account menu: <summary> does not
         resolve to the button role in every engine. -->
    <summary
        role="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={label}
        class="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded
               hover:bg-overlay [&::-webkit-details-marker]:hidden [&::marker]:content-none"
    >
        <MoreHorizontal class="h-4 w-4" aria-hidden="true" />
        <span class="sr-only">{label}</span>
    </summary>

    <!-- Click-away layer; without JS the summary still closes it. -->
    <button class="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onclick={closeMenu}
    ></button>

    <!-- Actions are forms and links of the caller's choosing. `w-max` keeps
         labels on one line; right-anchored so it never leaves the viewport on
         the last column. -->
    <div
        role="menu"
        class="card bg-surface absolute right-0 z-50 mt-1
               flex w-max min-w-40 flex-col py-1 text-left text-sm shadow-xl
               [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-left [&_button]:hover:bg-raised
               [&_a]:px-3 [&_a]:py-1.5 [&_a]:no-underline [&_a]:hover:bg-raised"
    >
        {@render children()}
    </div>
</details>
