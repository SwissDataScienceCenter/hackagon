<script lang="ts">
    import { resolve } from '$app/paths';
</script>

<footer
    class="flex h-14 items-center justify-between px-20
           border-t border-surface-200 dark:border-surface-800
           bg-surface-100 dark:bg-surface-900"
>
    <div class="flex items-center gap-5">
        <img src="/images/logos/sdsc-logo-footer.svg" alt="SDSC" class="h-3" />
        <span class="h-4 w-px bg-surface-300 dark:bg-surface-700"></span>
        <img src="/images/logos/eth-zurich.svg" alt="ETH Zurich" class="h-3 dark:invert" />
        <span class="h-4 w-px bg-surface-300 dark:bg-surface-700"></span>
        <img src="/images/logos/epfl.svg" alt="EPFL" class="h-3 dark:invert" />
    </div>
    <nav class="text-xs text-surface-500 flex gap-2">
        <a href={resolve('/privacy')} class="no-underline hover:text-primary-500">Privacy</a>
        <span>·</span>
        <a href={resolve('/terms')} class="no-underline hover:text-primary-500">Terms</a>
        <span>·</span>
        <a href={resolve('/about')} class="no-underline hover:text-primary-500">About</a>
        <span>·</span>
        <a href="https://github.com" class="no-underline hover:text-primary-500">GitHub</a>
    </nav>
    <div class="text-xs text-surface-500">
        Made with ❤️ by the SDSC team
    </div>
</footer>
