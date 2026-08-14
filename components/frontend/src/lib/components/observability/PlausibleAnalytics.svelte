<script lang="ts">
    /*
     * Plausible — how many people used which SCREEN.
     *
     * The other half of the observability kit answers a different question and
     * is much heavier: session replay records a browser to catch the bug class
     * that produces no RPC (SessionReplay.svelte). This one answers "is the
     * proposals page used at all", which nothing else here can — the RPC
     * journal sees calls, not visits, and a page whose whole job is to be read
     * makes no calls at all.
     *
     * OFF unless wired. `config === null` renders nothing, imports nothing and
     * requests nothing: no script tag, no network call, no console line. That
     * is the default state of a deployment that has never heard of this.
     *
     * NOT BEHIND THE CONSENT BANNER, deliberately — the reasoning is in
     * `+layout.server.ts` (the banner asks about session recording; consent is
     * scoped to what was asked; and this stores nothing in the browser to
     * consent to). Do-Not-Track and Global Privacy Control ARE honoured, here,
     * before the script is fetched.
     *
     * Three properties, the same three the replay component keeps:
     *
     *  1. It must not break SSR — everything happens in `onMount`.
     *  2. A dead endpoint must not take the app down — the script tag's
     *     failure is the browser's problem and nothing awaits it.
     *  3. It must not slow the boot — `defer`, and the first pageview is sent
     *     from an idle callback.
     */
    import { onMount } from 'svelte';
    import { afterNavigate } from '$app/navigation';
    import { page } from '$app/state';
    import { analyticsUrl, analyticsReferrer } from '$lib/utils/analyticsRoute';

    export type PlausibleConfig = {
        scriptUrl: string;
        domain: string;
    };

    let { config }: { config: PlausibleConfig | null } = $props();

    /**
     * Do Not Track / Global Privacy Control. Checked HERE, not passed as an
     * option, for the same two reasons as in SessionReplay.svelte: the script
     * is then never FETCHED (a request for an analytics script is itself a
     * small signal), and GPC — the signal with actual legal weight in several
     * jurisdictions — is not something Plausible's script looks at at all.
     */
    function tracking_refused(): boolean {
        if (typeof navigator === 'undefined') return false;
        const nav = navigator as Navigator & {
            globalPrivacyControl?: boolean;
            msDoNotTrack?: string;
        };
        const win = window as Window & { doNotTrack?: string };

        return (
            nav.doNotTrack === '1' ||
            nav.msDoNotTrack === '1' ||
            win.doNotTrack === '1' ||
            nav.globalPrivacyControl === true
        );
    }

    type PlausibleFn = ((event: string, options?: { u?: string }) => void) & {
        q?: unknown[];
    };

    /**
     * Send one pageview, with the two things the script would otherwise read
     * off the page itself replaced.
     *
     * `u` — passed explicitly, which is what `manual` mode is for. The script's
     * default is `location.href`; this app's URLs carry invite TOKENS and
     * hackathon ids, so what goes instead is the route TEMPLATE
     * (`/my/hackathon/[id]/teams`). See $lib/utils/analyticsRoute for why a
     * template beats a scrubbed path.
     *
     * `document.referrer` — read INSIDE the script (`h.r = document.referrer ||
     * null`), with no option to override, so it is shadowed for the duration
     * of the call and revealed again in `finally`. The same trick, for the same
     * reason, as the `document.URL` shadow in SessionReplay.svelte, and safe
     * for the same reason: the script builds its payload synchronously inside
     * the call, so the window is one function invocation wide.
     *
     * Engagement events (the tracker's `visibilitychange`/`blur` handlers) are
     * not a hole: they reuse the `u` of the last pageview, which is this
     * sanitized string, and the handlers are only attached once a pageview has
     * been sent.
     */
    function send_pageview(): void {
        const fn = (window as unknown as { plausible?: PlausibleFn }).plausible;
        if (!fn) return;

        const url = analyticsUrl(window.location.origin, page.route.id);
        const referrer = analyticsReferrer(document.referrer, window.location.origin);

        let shadowed = false;
        try {
            Object.defineProperty(document, 'referrer', {
                configurable: true,
                get: () => referrer
            });
            shadowed = true;
        } catch {
            // Non-configurable in some future engine: the pageview still goes,
            // and what leaks is a referrer, not the current page. Asserted in
            // the rig's verification rather than assumed here.
        }

        try {
            fn('pageview', { u: url });
        } finally {
            if (shadowed) delete (document as unknown as Record<string, unknown>)['referrer'];
        }
    }

    onMount(() => {
        if (!config) return;
        if (tracking_refused()) return;

        // The queue stub the tracker itself looks for (`window.plausible.q`),
        // so a pageview fired before the script finishes loading is replayed
        // rather than lost. Manual mode sends nothing on its own, so without
        // this the first view of a fast page would simply not be counted.
        const w = window as unknown as { plausible?: PlausibleFn };
        if (!w.plausible) {
            const stub = function (...args: unknown[]) {
                (stub.q = stub.q || []).push(args);
            } as PlausibleFn & { q?: unknown[] };
            w.plausible = stub;
        }

        const el = document.createElement('script');
        el.defer = true;
        el.src = config.scriptUrl;
        el.setAttribute('data-domain', config.domain);
        document.head.appendChild(el);

        // After first paint, never during it.
        const idle =
            typeof requestIdleCallback === 'function'
                ? requestIdleCallback(() => send_pageview())
                : setTimeout(() => send_pageview(), 0);

        return () => {
            if (typeof requestIdleCallback === 'function') cancelIdleCallback(idle as number);
            else clearTimeout(idle as ReturnType<typeof setTimeout>);
        };
    });

    // Client-side navigations. `manual` mode means the script counts nothing by
    // itself — which is the point: every pageview this app reports is one this
    // component decided to send, with a URL it built.
    afterNavigate((nav) => {
        if (!config || tracking_refused()) return;
        // The first `afterNavigate` fires for the initial load too (type
        // "enter"), which onMount has already counted.
        if (nav.type === 'enter') return;
        send_pageview();
    });
</script>
