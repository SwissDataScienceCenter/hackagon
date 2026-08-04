<!--
  Stacks and centres below sm. The three groups — logos, links, tagline — need
  roughly 470px side by side, so on a phone the fixed h-14 row overflowed rather
  than wrapping. Height goes back to fixed from sm, where they fit.
-->
<footer
    class="flex flex-col items-center gap-3 border-t border-surface-200-800
           bg-surface-100-900 px-4 py-4 sm:h-14 sm:flex-row sm:justify-between
           sm:gap-4 sm:px-10 sm:py-0 md:px-20"
>
    <div class="flex items-center gap-5">
        <img src="/images/logos/sdsc-logo-footer.svg" alt="SDSC" class="h-3" />
        <span class="h-4 w-px bg-surface-300-700"></span>
        <img src="/images/logos/eth-zurich.svg" alt="ETH Zurich" class="h-3 invert dark:invert-0" />
        <span class="h-4 w-px bg-surface-300-700"></span>
        <img src="/images/logos/epfl.svg" alt="EPFL" class="h-3 invert dark:invert-0" />
    </div>
    <nav class="flex flex-wrap justify-center gap-2 text-xs text-surface-500">
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static pages -->
        <a href="/privacy" class="no-underline hover:text-primary-500">Privacy</a>
        <span>·</span>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static pages -->
        <a href="/terms" class="no-underline hover:text-primary-500">Terms</a>
        <span>·</span>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static pages -->
        <a href="/about" class="no-underline hover:text-primary-500">About</a>
        <span>·</span>
        <a href="https://github.com" class="no-underline hover:text-primary-500">GitHub</a>
    </nav>
    <div class="text-center text-xs text-surface-500">
        Made with ❤️ by the SDSC team
    </div>
</footer>
