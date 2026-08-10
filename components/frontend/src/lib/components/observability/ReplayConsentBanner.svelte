<script lang="ts">
    /*
     * "May we record this browser?" — asked once, before anything is recorded.
     *
     * It renders ONLY when a deployment has configured session replay and this
     * browser has not yet answered. Two properties matter more than how it
     * looks:
     *
     *  1. NOTHING IS RECORDED WHILE IT IS ON SCREEN. The banner is not a
     *     courtesy shown over a tracker that is already running — the server
     *     withheld the ingest endpoint and the project key, so there is nothing
     *     to run. See `+layout.server.ts`.
     *  2. IT WORKS WITH NO JAVASCRIPT AT ALL. Two plain submit buttons in one
     *     `<form method="POST">`, no `use:enhance`, no `onclick`. A control
     *     that only works after hydration has already shipped here once
     *     (`.claude/CLAUDE.md`, 2026-08-05: the account menu swallowed its
     *     first click), and a consent button that quietly does nothing is not
     *     a cosmetic bug — it records a "yes" that was never given, or drops a
     *     "no" that was.
     *  3. IT TAKES NOBODY ELSE'S CONTROLS WITH IT. See the note on `sticky`
     *     below: this used to be `fixed`, and it made the bottom of every page
     *     unclickable for exactly the people who had not answered it yet.
     *
     * `returnTo` carries the current path so the 303 lands back where the
     * person was; the endpoint validates it before redirecting.
     */
    import { page } from '$app/state';

    let { consent, configured }: { consent: string | null; configured: boolean } = $props();

    const show = $derived(configured && consent === null);
    const returnTo = $derived(page.url.pathname + page.url.search);

    /*
     * How tall it turned out, published to CSS as `--consent-banner-h`.
     *
     * `sticky` (below) reserves space in the DOCUMENT, which is everything the
     * page's own content needs. It does nothing for chrome anchored to the
     * VIEWPORT: the hackathon sidebar is `sticky top-14 h-[calc(100vh-3.5rem)]`,
     * so it reaches the bottom of the screen at every scroll position and its
     * last four entries (Manage Pages, Prizes, Deadlines, Manage Forms) sat
     * under the banner with no scroll position that freed them —
     * `expectConsentBannerClearsContent` found that on all 21 `/my/hackathon/*`
     * routes at 1440px the moment it was written.
     *
     * A viewport-anchored element can only step aside if it knows the number,
     * and CSS cannot ask another element how tall it is — so it is measured
     * here and consumed as `pb-[var(--consent-banner-h,0px)]`. Measured, not
     * hard-coded: this text wraps to two and three lines as the viewport
     * narrows, and the binding is backed by a ResizeObserver, so a resize or a
     * copy edit moves it on its own.
     *
     * offsetHeight, not clientHeight: the screen the banner takes up includes
     * its 1px `border-t`, which clientHeight leaves out. One pixel of overlap
     * is invisible and would sit inside the e2e check's rounding tolerance —
     * i.e. it would be wrong in the one way nothing would ever tell us about.
     *
     * NO-JS NOTE, deliberately in this order: the ask itself needs no script
     * (property 2 above), and neither does the document's spacer. Only this
     * inset does, and the fallback is `0px` — a no-script browser sees exactly
     * what it saw before, minus the whole-page lid that `fixed` used to be.
     */
    let bannerHeight = $state(0);

    $effect(() => {
        const root = document.documentElement;
        root.style.setProperty('--consent-banner-h', `${bannerHeight}px`);
        // Runs on unmount — which is what answering the ask does, since `show`
        // turns false. A stale inset would keep a gap under every sidebar for
        // the rest of the session.
        return () => root.style.removeProperty('--consent-banner-h');
    });
</script>

{#if show}
    <!--
      `sticky bottom-0`, NOT `fixed`. It is the last thing in the document (the
      root layout renders it after the page), so sticky pins it to the bottom of
      the VIEWPORT while there is document below it, and settles into its own
      place in the flow once you reach the end. Two properties come out of that,
      and `fixed` had only the first:

        it is seen      pinned, so it does not hide at the foot of a long page;
        it is not a lid it occupies real space at the end of the document, so
                        every control can be scrolled clear of it.

      `fixed` takes NO space, so on any page whose controls reach the bottom of
      the viewport they could not be clicked at all — there was nowhere to
      scroll them to. Measured: the footer's Privacy/Terms/About/GitHub links at
      every width from 320 to 1440, and the CMS `visible` checkbox on
      /manage/pages, where the e2e journey died on its 10th action with 338 not
      run (Playwright: `<div role="region" aria-label="Session recording">
      intercepts pointer events`).

      Sticky is what makes the reserved space EXACTLY the banner's own height —
      at every viewport width, however many lines this text wraps to on a phone,
      and with no script involved. A hard-coded spacer would be wrong the first
      time somebody edits the sentence. (The `--consent-banner-h` variable above
      is a SECOND, narrower job: chrome pinned to the viewport rather than laid
      out in the document cannot be scrolled clear of anything, so it has to be
      told the number.) `helpers/reflow.ts:expectConsentBannerClearsContent`
      asserts both properties at 8 widths across every route in the app.

      It works because `<body>` is the containing block here (the layout's own
      wrapper is `min-h-screen`, and SvelteKit's `display: contents` div is not
      a box), and body's `overflow` propagates to the viewport rather than
      making body a scroll container — an ancestor scroller is the usual reason
      a sticky element quietly stops sticking, so keep it a child of body.
    -->
    <div
        bind:offsetHeight={bannerHeight}
        class="sticky bottom-0 z-[60] border-t border-line bg-surface p-4 shadow-lg"
        role="region"
        aria-label="Session recording"
    >
        <div
            class="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <p class="m-0 text-sm text-ink-2">
                <strong class="text-ink">Help us find broken buttons?</strong>
                We can record how this browser moves through the pages — clicks, scrolls and
                page structure — to find controls that do nothing. What you type, and the text
                on the page, are never sent. Nothing is recorded unless you say yes, and you
                can change your mind on your account page.
            </p>

            <form
                method="POST"
                action="/consent/replay"
                class="flex shrink-0 flex-wrap items-center gap-2"
            >
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                    type="submit"
                    name="decision"
                    value="denied"
                    class="btn btn-sm"
                >
                    No thanks
                </button>
                <button
                    type="submit"
                    name="decision"
                    value="granted"
                    class="btn btn-sm btn-accent"
                >
                    Allow recording
                </button>
            </form>
        </div>
    </div>
{/if}
