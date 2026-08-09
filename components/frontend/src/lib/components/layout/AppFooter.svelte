<!-- Reflows by design: a column of three centred rows on a phone, one spaced
     row once there is width for it. The previous version was a fixed-height
     (h-14) no-wrap row whose three groups need ~590px, so at phone widths the
     logos, the link row and the tagline were laid over one another. min-h
     keeps the desktop silhouette, but the height is no longer load-bearing:
     when the groups wrap, the footer grows instead of colliding inside a box
     that cannot. shrink-0 on the logos so a squeezed row can never scale them
     into each other — if there is no room they wrap, they do not shrink.
     (Pinned across widths by tests/mobile/chrome-reflow.spec.ts in the e2e
     skill.) -->
<footer
    class="flex min-h-14 flex-col items-center gap-4 border-t border-line
           bg-raised px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-between
           sm:gap-x-8 sm:gap-y-2 sm:px-10 sm:py-3 md:px-20"
>
    <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <img src="/images/logos/sdsc-logo-footer.svg" alt="SDSC" class="h-3 shrink-0" />
        <span class="h-4 w-px shrink-0 bg-overlay"></span>
        <img
            src="/images/logos/eth-zurich.svg"
            alt="ETH Zurich"
            class="h-3 shrink-0 invert dark:invert-0"
        />
        <span class="h-4 w-px shrink-0 bg-overlay"></span>
        <img
            src="/images/logos/epfl.svg"
            alt="EPFL"
            class="h-3 shrink-0 invert dark:invert-0"
        />
    </div>
    <nav class="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-3">
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static pages -->
        <a href="/privacy" class="no-underline hover:text-accent-ink">Privacy</a>
        <span>·</span>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static pages -->
        <a href="/terms" class="no-underline hover:text-accent-ink">Terms</a>
        <span>·</span>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static pages -->
        <a href="/about" class="no-underline hover:text-accent-ink">About</a>
        <span>·</span>
        <a href="https://github.com" class="no-underline hover:text-accent-ink">GitHub</a>
    </nav>
    <div class="text-center text-xs text-ink-3">
        Made with ❤️ by the SDSC team
    </div>
</footer>
