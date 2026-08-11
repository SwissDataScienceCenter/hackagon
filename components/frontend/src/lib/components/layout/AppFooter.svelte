<script lang="ts">
    import { resolve } from '$app/paths';
    import Linkedin from 'lucide-svelte/icons/linkedin';
    import Youtube from 'lucide-svelte/icons/youtube';
    import Twitter from 'lucide-svelte/icons/twitter';
    import { APP_VERSION } from '$lib/version';

    // Shaped after the datascience.ch footer: a brand column, link columns, the
    // parent institutions' logos, then a hairline and a bottom bar carrying the
    // copyright, the legal links and — our own addition — the build version.
    //
    // What that footer has and this one does not: the three office addresses and
    // the mailing-list signup. Neither belongs on a hackathon tool, and the
    // signup would have nothing behind it here.

    const year = new Date().getFullYear();

    // Every off-site href below was read out of datascience.ch's own markup
    // rather than guessed, because a wrong one here is wrong on every public
    // page. Re-check them if SDSC restructures its site.
    const SDSC_LINKS = [
        { label: 'About', href: 'https://datascience.ch/about' },
        { label: 'Events', href: 'https://datascience.ch/events' },
        { label: 'News', href: 'https://datascience.ch/news' },
        { label: 'Blog', href: 'https://datascience.ch/blog' },
        { label: 'Contact', href: 'https://datascience.ch/contact' },
    ];

    const LEGAL_LINKS = [
        { label: 'Privacy Policy', href: 'https://datascience.ch/privacy-policy' },
        { label: 'Terms of Service', href: 'https://datascience.ch/terms-of-service' },
        { label: 'Impressum', href: 'https://datascience.ch/impressum' },
    ];

    const SOCIALS = [
        {
            label: 'SDSC on LinkedIn',
            href: 'https://www.linkedin.com/company/swiss-data-science-center-sdsc/',
            icon: Linkedin,
        },
        {
            label: 'SDSC on YouTube',
            href: 'https://www.youtube.com/channel/UCyuJc6HtKnYY2B4n_Lg-bhA',
            icon: Youtube,
        },
        { label: 'SDSC on X', href: 'https://twitter.com/SDSCdatascience', icon: Twitter },
    ];

    // The footer spends no accent field — it is chrome, and the page above it
    // owns the one solid action. Links reach for accent only on hover.
    const LINK = 'text-sm text-ink-3 no-underline transition-colors hover:text-accent-ink';
    const LEGAL = 'text-xs text-ink-3 no-underline transition-colors hover:text-accent-ink';
    const LOGO_LINK = 'no-underline opacity-80 transition-opacity hover:opacity-100';
</script>

<footer class="border-t border-line bg-raised">
    <!-- Same inset as the page shell, so the columns line up with the content
         above them rather than with the header, which hugs the viewport. -->
    <div class="px-4 sm:px-10 md:px-20">
        <div class="grid gap-10 py-12 sm:grid-cols-2 md:grid-cols-4">
            <!-- Brand. The wordmark, not the hexagon mark that used to sit here:
                 this is the identity slot, and the bare mark cannot carry it. -->
            <div class="flex flex-col gap-4 sm:col-span-2">
                <a href={resolve('/')} class="w-fit no-underline" aria-label="SDSC Hackathons — home">
                    <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-7 dark:block" />
                    <img src="/logos/sdsc.svg" alt="SDSC" class="block h-7 dark:hidden" />
                </a>
                <p class="max-w-sm text-sm leading-relaxed text-ink-2">
                    Hackagon is the Swiss Data Science Center's platform for running hackathons —
                    from proposing projects and forming teams through to submissions, judging and
                    results.
                </p>
            </div>

            <nav class="flex flex-col gap-3" aria-label="Platform">
                <h2 class="meta">Platform</h2>
                <!-- Written out rather than looped: svelte/no-navigation-without-resolve
                     only recognizes a literal resolve() in the attribute. -->
                <a href={resolve('/')} class={LINK}>Hackathons</a>
                <a href={resolve('/(app)/dashboard')} class={LINK}>Dashboard</a>
            </nav>

            <nav class="flex flex-col gap-3" aria-label="Swiss Data Science Center">
                <h2 class="meta">SDSC</h2>
                {#each SDSC_LINKS as link (link.href)}
                    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- absolute off-site URL; resolve() is for app routes -->
                    <a href={link.href} class={LINK} target="_blank" rel="noopener noreferrer">
                        {link.label}
                    </a>
                {/each}
            </nav>
        </div>

        <!-- The parent institutions, as datascience.ch presents them. The source
             assets are light-on-transparent, so light mode inverts them — an
             asset-level swap, not a hand-rolled colour mode. -->
        <div class="flex flex-wrap items-center gap-x-8 gap-y-4 pb-10">
            <span class="meta">A joint venture of</span>
            <a href="https://ethz.ch" target="_blank" rel="noopener noreferrer" class={LOGO_LINK}>
                <img
                    src="/images/logos/eth-zurich.svg"
                    alt="ETH Zurich"
                    class="h-4 invert dark:invert-0"
                />
            </a>
            <a href="https://epfl.ch" target="_blank" rel="noopener noreferrer" class={LOGO_LINK}>
                <img src="/images/logos/epfl.svg" alt="EPFL" class="h-4 invert dark:invert-0" />
            </a>
        </div>
    </div>

    <!-- Bottom bar. The footer's one hairline, here, because this is the only
         place its content genuinely changes register. -->
    <div class="border-t border-line px-4 sm:px-10 md:px-20">
        <div class="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
            <p class="text-xs text-ink-3">
                © {year} Swiss Data Science Center. All rights reserved.
            </p>

            <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
                <nav class="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
                    {#each LEGAL_LINKS as link (link.href)}
                        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- absolute off-site URL; resolve() is for app routes -->
                        <a href={link.href} class={LEGAL} target="_blank" rel="noopener noreferrer">
                            {link.label}
                        </a>
                    {/each}
                </nav>

                <span class="hidden h-4 w-px bg-line md:block"></span>

                <!-- Block-scoped rather than -next-line: the anchor below spans
                     several lines, so the rule reports on the href line, not the
                     tag line a -next-line comment would cover. -->
                <!-- eslint-disable svelte/no-navigation-without-resolve -- absolute off-site URLs; resolve() is for app routes -->
                <div class="flex items-center gap-1">
                    {#each SOCIALS as social (social.href)}
                        {@const Icon = social.icon}
                        <a
                            href={social.href}
                            aria-label={social.label}
                            title={social.label}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="flex h-8 w-8 items-center justify-center rounded-control
                                   text-ink-3 no-underline transition-colors
                                   hover:bg-overlay hover:text-accent-ink"
                        >
                            <Icon class="h-4 w-4" />
                        </a>
                    {/each}
                </div>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->

                <span class="hidden h-4 w-px bg-line md:block"></span>

                <!-- Mono and tabular, like every other identifier in the app.
                     Deliberately not a link: the repository is private, so one
                     here would 404 for most visitors. -->
                <span
                    class="tnum font-mono text-xs text-ink-3"
                    title="Build version — quote this in a bug report"
                >
                    {APP_VERSION}
                </span>
            </div>
        </div>
    </div>
</footer>
