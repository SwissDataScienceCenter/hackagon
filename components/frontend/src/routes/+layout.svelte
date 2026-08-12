<script lang="ts">
    // Chrome is mounted by the (public) and (app) group layouts — both through
    // the one AppShell, so the top bar and the footer are the same on either
    // side of a login — and the root layout only loads global styles. The shell
    // is not hoisted HERE because the groups differ in what they load and guard
    // (only (app) has a +layout.server.ts), not in what chrome they wear.
    import '../app.css';
    // ...and mounts session replay, which needs to cover BOTH groups: the
    // dead-control bugs it exists to catch happen on the landing page and the
    // invite link too, not only behind a login. It renders nothing, and does
    // nothing at all unless `replay.enabled` is set in config.yaml AND this
    // browser has consented — see $lib/utils/replayConsent.
    import SessionReplay from '$lib/components/observability/SessionReplay.svelte';
    // The ask. Same reasoning about where it is mounted: the tracker would run
    // on public pages, so the question has to be answerable there.
    import ReplayConsentBanner from '$lib/components/observability/ReplayConsentBanner.svelte';
    import type { LayoutData } from './$types';

    const { children, data }: { children: import('svelte').Snippet; data: LayoutData } =
        $props();
</script>

<SessionReplay config={data.replay.config} />

{@render children()}

<ReplayConsentBanner consent={data.replay.consent} configured={data.replay.configured} />
