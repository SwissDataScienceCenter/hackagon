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

<!-- No min-h-screen here. That used to stretch this container to at least
     100vh, which — via flex-1 on <main> — pinned the footer to the exact
     bottom edge of the viewport even on a short page: it was visible on
     first paint, with nothing to scroll. The footer should only come into
     view once the page's own content actually reaches it, so height here is
     the natural sum of header + content + footer, nothing forced. -->
<div class="flex flex-col">
    <NavBar {session} />
    <main>
        {@render children()}
    </main>
    <AppFooter />
</div>
