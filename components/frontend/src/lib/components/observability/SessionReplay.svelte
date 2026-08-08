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
     * OFF by default. It renders nothing and imports nothing unless
     * `replay.enabled: true` is in config.yaml; see `replaySchema` in
     * `$lib/schemas/config-schema` for what switching it on collects.
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
     * What survives is structure: the DOM tree, tag names, class lists, the
     * page URL, layout, mutations, scrolls, and clicks carrying the CSS path
     * of the element hit. That is precisely what a dead control looks like — a
     * real click on a real selector with nothing following it — so the masking
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
        if (!config) return;

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
                        sessionTokenHeader: false
                    },

                    // A visitor who has asked not to be tracked is not an
                    // exception to make for a debugging tool.
                    respectDoNotTrack: true,

                    // The SDK refuses to record a page served over plain http.
                    // Only a config that says so out loud lifts that.
                    __DISABLE_SECURE_MODE: config.allowInsecureOrigin
                });

                const started = await tracker.start();
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
