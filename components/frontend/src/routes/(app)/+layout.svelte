<script lang="ts">
    // The app shell is a top bar and nothing else: identity, theme and sign-out.
    // Per-hackathon navigation is not shell chrome — it belongs to one hackathon,
    // so HackathonSidebar renders inside my/hackathon/[id] instead of here, where
    // it followed you onto the dashboard and the admin routes it had nothing to
    // say about.
    import { afterNavigate, onNavigate, replaceState } from '$app/navigation';
    import { page } from '$app/state';
    import NavBar from '$lib/components/layout/NavBar.svelte';
    import AppFooter from '$lib/components/layout/AppFooter.svelte';
    import { backFor } from '$lib/navigation/backLink';
    import { pendingBack } from '$lib/navigation/backTrail.svelte';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { children, data }: { children: Snippet; data: LayoutData } = $props();

    // Every page's way back — see $lib/navigation/backLink. Decided before the
    // new page renders, while `page.state` is still the page being left's.
    // Back and Forward land on an entry that already has its own, so they only
    // clear what an earlier navigation left here.
    onNavigate((navigation) => {
        if (navigation.type === 'popstate' || !navigation.to) {
            pendingBack.href = '';
            pendingBack.back = undefined;
            return;
        }
        pendingBack.href = navigation.to.url.href;
        pendingBack.back = backFor(
            navigation.from && { url: navigation.from.url, routeId: navigation.from.route.id },
            navigation.to,
            page.state.back
        );
    });

    // Then stored on the entry, which is what Back and Forward bring back. Not
    // when a redirect landed somewhere else than was decided for: that page
    // gets its own list rather than a guess.
    afterNavigate((navigation) => {
        if (navigation.type === 'popstate' || navigation.type === 'enter') return;
        if (pendingBack.href !== page.url.href) return;
        replaceState('', { ...page.state, back: pendingBack.back });
    });
</script>

<div class="flex min-h-screen flex-col">
    <NavBar session={data.session ?? null} sessionExpired={data.sessionExpired ?? false} />
    <main class="flex-1">
        {@render children()}
    </main>
    <!-- The app shell had no footer, so a signed-in user — the one most likely
         to be reporting a bug — could not see which build they were on. It
         carries the version and nothing else the shell does not already say. -->
    <AppFooter buildCommit={data.buildCommit ?? null} />
</div>
