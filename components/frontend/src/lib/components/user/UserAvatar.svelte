<script lang="ts">
    let {
        displayName,
        username,
        size = 'size-8 text-[10px]',
    }: {
        displayName: string;
        username: string;
        /** Tailwind size and text classes, e.g. `size-10 text-xs`. */
        size?: string;
    } = $props();

    // Keycloak may leave display_name empty, hence the username fallback; '?'
    // covers both being blank, so the avatar is never an empty circle that
    // reads as a rendering fault.
    const initials = $derived.by(() => {
        const source = displayName.trim() || username.trim();
        const letters = source
            .split(/\s+/)
            .map((w) => w[0] ?? '')
            .join('')
            .toUpperCase()
            .slice(0, 2);
        return letters || '?';
    });
</script>

<div
    class="flex shrink-0 items-center justify-center rounded-full border-2
           border-line bg-overlay font-bold text-ink {size}"
    aria-hidden="true"
>
    {initials}
</div>
