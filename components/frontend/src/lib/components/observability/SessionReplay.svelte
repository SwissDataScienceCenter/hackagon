<script lang="ts">
    /*
     * OpenReplay session replay — the browser half of the debugging kit.
     *
     * It exists for the one bug class the backend's RPC journal structurally
     * cannot see: a click that produces NO RPC. A button wired to the wrong
     * handler, a control that swallows its first click before hydration, a
     * page nothing links to — none of those emit a request, and that absence
     * is the bug. The journal records what the server was asked to do; this
     * records what the person actually did.
     *
     * OFF by default, TWICE. It renders nothing and imports nothing unless
     * `replay.enabled: true` is in config.yaml AND this browser has given
     * consent; `+layout.server.ts` withholds `config` unless both hold, so
     * `config === null` is the default state of a first-time visitor to a
     * fully-configured deployment. See `$lib/utils/replayConsent` for why the
     * permission is a cookie and not a registration consent, and
     * `docs/frontend/session-replay.md` for what enabling it collects.
     *
     * Three properties this file has to keep:
     *
     *  1. It must not break SSR. Everything happens in `onMount`, so the SDK
     *     is only ever touched in a browser.
     *  2. A dead ingest endpoint must not take the app down. Both the import
     *     and the start are caught and dropped — a replay we cannot record is
     *     not worth a broken page.
     *  3. It must not slow the boot. The SDK is a dynamic import fired from an
     *     idle callback, so it is a separate chunk fetched after the page is
     *     interactive rather than part of the entry bundle.
     */
    import { onMount } from 'svelte';

    export type ReplayConfig = {
        ingestPoint: string;
        projectKey: string;
        allowInsecureOrigin: boolean;
    };

    let { config }: { config: ReplayConfig | null } = $props();

    /**
     * Do Not Track / Global Privacy Control, checked HERE and not only handed
     * to the SDK.
     *
     * `respectDoNotTrack: true` is set below and the tracker does honour it
     * (v18.1.2 reads `navigator.doNotTrack == '1' || window.doNotTrack == '1'`
     * in its constructor and refuses to start), but "we passed the option" is
     * the kind of claim this codebase does not accept about masking either.
     * Checking first buys two things the flag cannot:
     *
     *  - THE SDK IS NEVER FETCHED. The tracker's own check runs inside the
     *     tracker, which means the chunk has already been downloaded from the
     *     app's origin by the time it declines. A request for a replay SDK is
     *     itself a small signal about the visitor; not making it is better
     *     than making it and then behaving.
     *  - GPC IS COVERED. `navigator.globalPrivacyControl` is the signal that
     *     actually has legal weight in several jurisdictions, and the tracker
     *     does not look at it at all.
     *
     * The outcome — not the flag — is what
     * `tests/openreplay/consent.spec.ts` asserts, with DNT set as a real
     * Firefox preference and consent deliberately GRANTED, so the only thing
     * left that can suppress recording is this.
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

    /**
     * Start the tracker without handing it the current URL.
     *
     * THE ONE URL NO OPTION REACHES. `resourceBaseHref` covers the DOM
     * messages and `urls.urlSanitizer` covers the page location, but the
     * tracker's very FIRST batch carries a header — `BatchMetadata`, message
     * type 81 — whose last field is `document.URL`, read verbatim inside
     * `start()` and posted straight to its web worker. The same call sends
     * `document.referrer` in the start request body. Neither has a hook.
     *
     * It is one occurrence per session and it is the worst one: a fresh page
     * load of `/invite/<token>` is exactly a first batch, and that token is a
     * working credential. (Later batches are safe by accident — the worker
     * overwrites its stored url from the SetPageLocation message, which
     * privateMode has already reduced to asterisks.)
     *
     * So the two properties are shadowed with own properties on `document`
     * for the duration of `start()` and deleted again in `finally`, revealing
     * the prototype getters unchanged. The window is one fetch, during an idle
     * callback after first paint; nothing of ours reads either property, and
     * the tracker's own reader (the viewport ticker) simply re-sends the
     * location once the shadow is gone — masked, as it already was.
     *
     * If a future engine makes these non-configurable this silently does
     * nothing, which is why the assertion lives in
     * `tests/openreplay/masking.spec.ts` (with an unmasked control that DOES
     * transmit the path) and not in this comment.
     */
    async function start_without_url(tracker: {
        start: () => Promise<{ success: boolean }>;
    }): Promise<{ success: boolean }> {
        const shadowed: string[] = [];
        for (const [prop, value] of [
            ['URL', `${window.location.origin}/`],
            ['referrer', '']
        ] as const) {
            try {
                Object.defineProperty(document, prop, {
                    configurable: true,
                    get: () => value
                });
                shadowed.push(prop);
            } catch {
                // Non-configurable: leave it. The spec is what fails, loudly.
            }
        }

        try {
            return await tracker.start();
        } finally {
            for (const prop of shadowed) {
                delete (document as unknown as Record<string, unknown>)[prop];
            }
        }
    }

    /**
     * Remove whatever the tracker left in this browser's storage.
     *
     * Runs whenever `config` is null — which is the state after somebody
     * withdraws consent. The tracker keeps its session id and buffer in
     * local/sessionStorage under `__openreplay*` keys; without this, a
     * withdrawal would stop the recording but leave the identifier that
     * stitched the previous ones together sitting in the browser, ready to
     * resume the same session if consent were ever given again. Withdrawing
     * should end a session, not pause it.
     */
    function purge_tracker_storage(): void {
        for (const store of [localStorage, sessionStorage]) {
            try {
                const doomed: string[] = [];
                for (let i = 0; i < store.length; i++) {
                    const key = store.key(i);
                    if (key && key.startsWith('__openreplay')) doomed.push(key);
                }
                for (const key of doomed) store.removeItem(key);
            } catch {
                // Private mode, disabled storage, a quota error — none of it is
                // worth breaking a page over.
            }
        }
    }

    /*
     * MASKING — the reason this component is worth reviewing.
     *
     * OpenReplay records the DOM, and its shipped default is to record input
     * values and page text VERBATIM: masking is opt-in per field. On this app
     * that default captures the registration form — dietary requirements,
     * accessibility needs, affiliations, free text — which is exactly the data
     * the RPC journal's allowlist exists to keep off disk. Per-field opt-in
     * also fails the wrong way: a field added later is captured until somebody
     * remembers to mark it.
     *
     * So the posture is default-deny, and NOTHING is un-masked:
     *
     *   privateMode         every element and text node is obscured unless it
     *                       carries `data-openreplay-unmask`. Nothing in this
     *                       app carries it. It also stars the click label, the
     *                       input label and console output, and blanks `href`.
     *   defaultInputMode    Hidden (2): an input's value is never sent at all,
     *                       not sent-and-starred. Belt to privateMode's braces
     *                       — this is the option that is specifically about
     *                       <input>/<textarea>, and the stricter of the two
     *                       wins.
     *   obscure*            numbers, emails and dates in both text nodes and
     *                       inputs, explicitly, rather than relying on the
     *                       library's defaults staying what they are today.
     *   consoleMethods []   console capture off. privateMode would send it as
     *                       a row of asterisks anyway; not collecting it is
     *                       cheaper and needs no argument.
     *   network             URLs and headers are already wiped by privateMode;
     *                       capturePayload stays off so bodies are never read.
     *
     * What survives is structure: the DOM tree, tag names, class lists,
     * layout, mutations, scrolls, and clicks carrying the CSS path of the
     * element hit. That is precisely what a dead control looks like — a real
     * click on a real selector with nothing following it — so the masking
     * costs this use case nothing.
     *
     * ONE HOLE NO OPTION CLOSES, and it is not obvious from the API: masking
     * applies to TEXT NODES and input values. ATTRIBUTE values are sent
     * VERBATIM — the tracker stars only `alt` and `placeholder`, and blanks
     * `href`. So `title={userName}` shipped a person's full name in clear
     * while the same name, one element away as text, arrived as asterisks.
     * That attribute is gone (NavBar.svelte) and the spec asserts it stays
     * gone, but the rule is a review rule, not a setting: personal data goes
     * in text nodes, never in an attribute.
     *
     * URLs — READ THIS BEFORE REMOVING `resourceBaseHref`.
     *
     * privateMode DOES wipe the page location: `SetPageLocation` runs its url,
     * referrer and title through `stringWiper` (asterisks), so the OpenReplay
     * UI shows `****` for every page of every session. That is not where the
     * URL leaks. The tracker stamps `app.getBaseHref()` — which defaults to
     * `document.baseURI`, i.e. the FULL current URL — onto every URL-based DOM
     * message (`SetNodeAttributeURLBased`, `SetCSSDataURLBased`,
     * `AdoptedSSReplaceURLBased`), so the replayer can resolve relative asset
     * paths. Those are not sanitized. Read out of a real capture, not out of
     * the docs: the bytes contained
     * `http://localhost:8081/register/019fe19a-…` dozens of times while every
     * text node beside them was asterisks.
     *
     * Ids and route shapes would have been arguable. `/invite/<token>` is not:
     * that token IS the credential — `hooks.server.ts` makes the invite route
     * public precisely because the URL authenticates the visitor — so a
     * recording of somebody opening their invitation contains a working key to
     * a private event, readable by anyone with access to the replay UI. A
     * debugging tool must not become a credential store.
     *
     * `resourceBaseHref` short-circuits `getBaseHref()` with a fixed string,
     * so every one of those messages carries the ORIGIN and no path. The cost
     * is that a relative asset href recorded on a deep route resolves against
     * `/` in the replayer, so some CSS may not load there. That is a fair
     * trade: the location is already `****` in the UI, so the path in these
     * messages was never something the tool showed anyone — it was incidental
     * leakage, and the replayer's own asset cache is what actually paints the
     * page.
     *
     * `urls.urlSanitizer` is set as well. It cannot reach `getBaseHref`, and
     * today privateMode already wipes the location it does reach — it is there
     * so that a future version which stops wiping, or a deployment that
     * relaxes privateMode, still cannot ship a path. The third and last
     * vector, the batch header, is closed by `start_without_url` above; read
     * that comment before touching it.
     *
     * Identity is deliberately not set. `tracker.setUserID()` is never called
     * and no replay/session id is ever sent to the backend, so a recording
     * cannot be joined to a person's rows or to their line in the RPC journal.
     * Linking those is the owner's decision to make, not a default to drift
     * into.
     *
     * This is asserted, not asserted-in-a-comment: the sentinel test in
     * `.claude/skills/hackathon-e2e/tests/openreplay/masking.spec.ts` types a
     * unique string into the registration form and greps the captured ingest
     * bodies for it.
     */
    onMount(() => {
        if (!config) {
            // No consent (or replay is not configured at all). Leave nothing of
            // a previous session behind.
            purge_tracker_storage();

            return;
        }

        // Asked not to be tracked. Not an exception to make for a debugging
        // tool — and checked before the import, so the SDK is never fetched.
        if (tracking_refused()) return;

        let stop: (() => void) | undefined;
        let cancelled = false;

        const boot = async () => {
            try {
                const { default: Tracker } = await import('@openreplay/tracker');
                if (cancelled) return;

                const tracker = new Tracker({
                    projectKey: config.projectKey,
                    ingestPoint: config.ingestPoint,

                    // --- default-deny masking (see the block comment) ---
                    privateMode: true,
                    defaultInputMode: 2, // InputMode.Hidden
                    obscureInputNumbers: true,
                    obscureInputEmails: true,
                    obscureInputDates: true,
                    obscureTextNumbers: true,
                    obscureTextEmails: true,
                    consoleMethods: [],

                    // --- no URL ever carries a path (see the block comment) ---
                    resourceBaseHref: `${window.location.origin}/`,
                    urls: {
                        urlSanitizer: (url: string) => {
                            try {
                                return new URL(url).origin;
                            } catch {
                                return '';
                            }
                        }
                    },

                    network: {
                        // Bodies are never read.
                        capturePayload: false,
                        captureInIframes: false,
                        // Drop every request/response header rather than a
                        // named few — privateMode wipes them anyway, and a
                        // deny-list has to be maintained.
                        ignoreHeaders: true,
                        failuresOnly: false,
                        // THE IMPORTANT ONE. Set to a header name (or `true`,
                        // which means `openReplaySession`), the tracker
                        // stamps its session id onto every request the page
                        // makes — so the Go backend would receive it, and
                        // could log it beside the actor in the RPC journal.
                        // That is precisely the correlation between a
                        // recording and a person's data that has been
                        // deliberately deferred, and it would arrive as a
                        // default rather than as a decision. `false` keeps
                        // the two systems unable to be joined.
                        sessionTokenHeader: false,
                        // Request URLs reach the replay too. Same rule as the
                        // page location: origin only, no path, no query.
                        // Generic so it stays assignable to the SDK's
                        // `(d: RequestResponseData) => RequestResponseData`
                        // without importing that type into a client bundle.
                        sanitizer: <T extends { url: string }>(data: T): T => {
                            try {
                                data.url = new URL(data.url, window.location.origin).origin;
                            } catch {
                                data.url = '';
                            }

                            return data;
                        }
                    },

                    // A visitor who has asked not to be tracked is not an
                    // exception to make for a debugging tool. Belt to
                    // `tracking_refused()`'s braces.
                    respectDoNotTrack: true,

                    // The SDK refuses to record a page served over plain http.
                    // Only a config that says so out loud lifts that.
                    __DISABLE_SECURE_MODE: config.allowInsecureOrigin
                });

                const started = await start_without_url(tracker);
                if (cancelled) {
                    tracker.stop();
                    return;
                }
                if (!started.success) return; // e.g. DNT, or the backend said no
                stop = () => tracker.stop();
            } catch {
                // Unreachable ingest, blocked script, no IndexedDB — none of
                // it is the app's problem. Recording is best-effort.
            }
        };

        // After first paint, never during it.
        const idle =
            typeof requestIdleCallback === 'function'
                ? requestIdleCallback(() => void boot())
                : setTimeout(() => void boot(), 0);

        return () => {
            cancelled = true;
            if (typeof requestIdleCallback === 'function')
                cancelIdleCallback(idle as number);
            else clearTimeout(idle as ReturnType<typeof setTimeout>);
            stop?.();
        };
    });
</script>
