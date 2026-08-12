<script lang="ts">
    /*
     * The sign-in interstitial: what an anonymous visitor sees between opening a
     * page they cannot have and arriving at Keycloak.
     *
     * It replaces a bare 303 to the landing page, which told them nothing and
     * threw their destination away. Everything here exists to answer three
     * questions — what happened, where am I going, and how do I get on with it.
     *
     * NO JAVASCRIPT IS REQUIRED to sign in from this page. The floor is the
     * <form> below: a same-origin POST to this route's Auth.js action, which is
     * exactly what @auth/sveltekit's own <SignIn> component posts. With no
     * script, that button is the whole feature and it works.
     *
     * A <meta http-equiv="refresh"> was the alternative and does not work here:
     * a meta refresh can only issue a GET, and starting an OIDC flow is a POST
     * (Auth.js mints the state/PKCE/nonce cookies on it). A GET-initiated login
     * would mean either re-implementing that entry point or forwarding to
     * Auth.js's own unstyled provider picker — a second interstitial, worse than
     * the one being replaced. So the automatic hop is the JS half and the button
     * is the guaranteed half, which is the right way round: the button is
     * present, labelled and operable for everyone.
     *
     * WHEN SCRIPT IS AVAILABLE the same intent is expressed through Auth.js's
     * CLIENT helper instead of by submitting the form, and that is not a style
     * choice. SvelteKit rejects with 403 any form POST whose `Origin` differs
     * from the server's configured `ORIGIN` — and a built server answering a
     * public hostname while carrying a fixed `http://localhost:8081` origin is a
     * state this repo has shipped twice, each time surfacing as "every page
     * loads and Log in does nothing". Auth.js's own endpoints derive their URLs
     * from the request headers, so they are unaffected. Both paths are covered:
     * the no-JS suite drives the form, the JS suite drives this.
     */
    import { onMount } from 'svelte';
    import { signIn } from '@auth/sveltekit/client';
    import { resolve } from '$app/paths';
    import Seo from '$lib/components/layout/Seo.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    /** Long enough to read the sentence, short enough not to feel stuck. */
    const DELAY_MS = 2000;

    // False during SSR, and false forever in a browser with JavaScript off. The
    // status line must not claim to be sending anybody anywhere until something
    // is actually able to — a promise the page cannot keep is worse than no
    // promise, because the visitor waits for it.
    let auto = $state(false);

    // `data.destination` is already validated server-side (loginDestination), so
    // this callbackUrl cannot be an off-site redirect.
    function goToLogin() {
        signIn('keycloak', { callbackUrl: data.destination });
    }

    onMount(() => {
        auto = true;
        const timer = setTimeout(goToLogin, DELAY_MS);

        return () => clearTimeout(timer);
    });
</script>

<!-- noindex: this page only ever exists on the way somewhere else, and the URL
     carries wherever that was. -->
<Seo
    title="Sign in"
    description="Sign in to the SDSC hackathon platform."
    noindex
/>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16 sm:px-10">
    <h1 class="m-0 text-display">Sign in to continue</h1>

    <!-- role="status" (an aria-live=polite region), because the whole point of
         this page is the explanation: a screen reader that is only told the
         heading learns nothing about why the page it asked for did not open, and
         the swap to "taking you there" below happens after load, which is
         precisely the change a status region exists to announce. -->
    <div role="status" class="flex flex-col gap-3 text-base leading-relaxed text-ink-2">
        {#if data.deepLinked}
            <p class="m-0">
                You're not signed in, so
                <!-- The path as TEXT, never in a title/attribute: attribute
                     values leave this page verbatim under session replay while
                     text nodes are masked (see NavBar). -->
                <span class="break-all font-mono text-sm text-ink">{data.destination}</span>
                is not available yet.
            </p>
        {:else}
            <p class="m-0">You're not signed in yet.</p>
        {/if}

        {#if auto}
            <p class="m-0">Taking you to the login page in {DELAY_MS / 1000} seconds…</p>
        {:else}
            <p class="m-0">Continue to the login page using the button below.</p>
        {/if}

        <p class="m-0">
            {#if data.deepLinked}
                Once you're signed in we'll bring you straight back to
                <span class="break-all font-mono text-sm text-ink">{data.destination}</span>.
            {:else}
                Once you're signed in you'll land on your dashboard.
            {/if}
        </p>
    </div>

    <!-- The Auth.js sign-in action for this route. Two hidden fields carry
         everything it needs:
           providerId  which provider to start (this deployment has one).
           redirectTo  where to land AFTERWARDS. Not optional and not
                       decorative: @auth/sveltekit falls back to the Referer
                       header when it is absent, and the Referer here is this
                       very page — the login would come back to the
                       interstitial instead of to the page that was asked for.
         The value is already validated (loginDestination in +page.server.ts),
         so a crafted ?returnTo= cannot become an off-site callback. -->
    <form method="POST" action="/signin" class="flex flex-wrap items-center gap-3">
        <input type="hidden" name="providerId" value="keycloak" />
        <input type="hidden" name="redirectTo" value={data.destination} />

        <!-- Still `type="submit"` inside a real form: with no script — or before
             hydration — a click posts the form and the login starts anyway. The
             handler only takes over once there IS a handler. -->
        <button
            type="submit"
            class="btn btn-solid"
            onclick={(e) => {
                e.preventDefault();
                goToLogin();
            }}
        >
            Go to login now
        </button>

        <!-- An exit. Nobody should be held on a page whose only offer is a
             countdown they did not ask for. -->
        <a href={resolve('/')} class="btn btn-outline no-underline">Back to the home page</a>
    </form>
</section>
