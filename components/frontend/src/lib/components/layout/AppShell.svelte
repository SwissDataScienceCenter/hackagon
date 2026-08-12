<script lang="ts">
    /*
     * The page shell every route group renders: top bar, the page, footer.
     *
     * It exists because the footer did NOT render on the signed-in half of the
     * app. When the routes were split into `(public)` and `(app)`
     * (5551b8d), each group got its own copy of the shell markup and only
     * `(public)`'s copy mounted `AppFooter` — so `/dashboard`, `/account`,
     * `/hackathons/create`, every `/manage/*` page and all 21 `/my/hackathon/*`
     * pages shipped with no footer at all.
     *
     * That is not cosmetic here. The footer is the ONLY inbound link to the
     * platform's own SitePages — Privacy, Terms, About — and this repo has now
     * shipped an unreachable route three times (`/account`, `/manage/pages`,
     * and the browse page). A signed-in person could not reach the privacy
     * policy from anywhere inside the app.
     *
     * One component rather than two identical blocks, so a third group cannot
     * be added with a shell that quietly differs again. The groups still own
     * what they always owned — their own `+layout.server.ts`, their own guards
     * and their own data — they just no longer each own a private idea of what
     * the chrome is.
     */
    import type { Snippet } from 'svelte';
    import type { Session } from '@auth/sveltekit';
    import NavBar from './NavBar.svelte';
    import AppFooter from './AppFooter.svelte';

    let {
        session = null,
        children,
    }: {
        session?: Omit<Session, 'accessToken'> | null;
        children: Snippet;
    } = $props();
</script>

<!-- min-h-screen + flex-1 on <main>: the footer sits at the bottom of the
     VIEWPORT on a short page and at the bottom of the DOCUMENT on a long one,
     rather than floating halfway up an empty screen. -->
<div class="flex min-h-screen flex-col">
    <NavBar {session} />
    <main class="flex-1">
        {@render children()}
    </main>
    <AppFooter />
</div>
