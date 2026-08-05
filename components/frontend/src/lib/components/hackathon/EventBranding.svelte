<script module lang="ts">
    /**
     * Hex colours as SetBranding accepts them: #rgb or #rrggbb.
     *
     * The backend validates on write, but this check is deliberately NOT
     * redundant. These values are read out of the database and interpolated
     * into a `style` attribute, and a row written before that check existed —
     * or by some future write path that forgets it — would otherwise become a
     * CSS injection. Anything that is not a plain hex colour is dropped, and
     * the page falls back to the platform theme.
     */
    const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    export function safeHex(value: string | undefined | null): string | undefined {
        if (!value) return undefined;
        const v = value.trim();
        return HEX.test(v) ? v : undefined;
    }

    /** Expands #rgb to #rrggbb and returns the three channels. */
    function channels(hex: string): [number, number, number] {
        const body = hex.slice(1);
        const full =
            body.length === 3
                ? body
                      .split('')
                      .map((c) => c + c)
                      .join('')
                : body;
        return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
            number,
            number,
            number,
        ];
    }

    /**
     * Picks near-black or white text for an arbitrary organizer-chosen
     * background, using the WCAG relative luminance. Without this, a pale brand
     * colour would render white-on-yellow banner text.
     */
    function readableOn(hex: string): string {
        const linear = (c: number) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const [r, g, b] = channels(hex);
        const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
        return luminance > 0.45 ? '#111827' : '#ffffff';
    }
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';

    let {
        primaryColor,
        accentColor,
        bannerText,
        children,
    }: {
        /** Hex colour from ConfigService.SetBranding; anything else is ignored. */
        primaryColor?: string;
        accentColor?: string;
        /** Free text, rendered as text. Empty means no banner at all. */
        bannerText?: string;
        children: Snippet;
    } = $props();

    const primary = $derived(safeHex(primaryColor));
    const accent = $derived(safeHex(accentColor));
    const banner = $derived((bannerText ?? '').trim());

    // Scoped to this wrapper on purpose: setting these on :root would repaint
    // the rest of the app with one event's colours. Only properties that
    // survived validation are declared, so an unbranded event emits no style
    // attribute at all and inherits the platform theme untouched.
    const scopeStyle = $derived(
        [
            primary ? `--brand-primary: ${primary}` : '',
            accent ? `--brand-accent: ${accent}` : '',
        ]
            .filter(Boolean)
            .join('; ') || undefined,
    );

    // The rule reads as one event's colours even when only one was set.
    const ruleStyle = $derived.by(() => {
        if (primary && accent)
            return `background-image: linear-gradient(90deg, var(--brand-primary), var(--brand-accent))`;
        if (primary) return `background-color: var(--brand-primary)`;
        if (accent) return `background-color: var(--brand-accent)`;
        return undefined;
    });

    const bannerStyle = $derived(
        primary
            ? `background-color: var(--brand-primary); color: ${readableOn(primary)}`
            : undefined,
    );
</script>

<!-- display:contents — an unbranded event must not gain a single box, so there
     is no layout shift and the page renders exactly as it did before. -->
<div class="contents" style={scopeStyle}>
    {#if ruleStyle}
        <div class="h-1.5 w-full" style={ruleStyle} aria-hidden="true"></div>
    {/if}

    {#if banner}
        <div
            class="w-full px-4 py-2.5 text-center text-sm font-medium sm:px-10
                   {bannerStyle ? '' : 'btn-accent'}"
            style={bannerStyle}
        >
            {banner}
        </div>
    {/if}

    {@render children()}
</div>
