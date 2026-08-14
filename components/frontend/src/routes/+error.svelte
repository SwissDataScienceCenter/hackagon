<script lang="ts">
    import { page } from '$app/state';
    import { AlertTriangle } from 'lucide-svelte';
    import { resolve } from '$app/paths';

    const status = page.status;
    const message = page.error?.message;

    // Where "back" actually means, rather than always Home. A 403 inside a
    // hackathon almost always fires deeper than this page's own load can see —
    // the member layout itself refuses a non-member before its own data ever
    // resolves — so the hackathon id is read off the URL, not off `page.data`.
    // The public page is the destination for BOTH cases a hackathon-scoped 403
    // covers: not a confirmed member yet (it offers Join) and a confirmed
    // member hitting an organiser-only page (it offers "Open your event view"
    // straight back into /my/hackathon/<id>/overview) — one link, and it is
    // never wrong about which of the two applies.
    const hackathonId = $derived(
        page.url.pathname.match(/^\/(?:my\/)?hackathon\/([^/]+)/)?.[1],
    );
    const signedIn = $derived(Boolean(page.data?.session?.user));

    const back = $derived(
        hackathonId
            ? { href: resolve(`/hackathon/${hackathonId}`), label: 'Back to this hackathon' }
            : signedIn
              ? { href: resolve('/(app)/dashboard'), label: 'Go to Dashboard' }
              : { href: resolve('/'), label: 'Go to Homepage' },
    );
</script>

<div class="flex min-h-screen flex-col items-center justify-center px-4">
    <div class="card flex w-full max-w-lg flex-col items-center gap-4 p-8 text-center">
        <AlertTriangle class="text-danger-ink" size={64} stroke-width={1.5} />
        <h1 class="m-0 text-display">{status}</h1>

        <p class="prose m-0 text-ink-2">
            {message || 'An unexpected error occurred.'}
        </p>

        <hr class="my-2 w-full border-line" />

        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built with resolve() above; the rule only recognizes a literal resolve() call in the attribute itself -->
        <a href={back.href} class="btn btn-outline-accent no-underline">
            {back.label}
        </a>
    </div>
</div>
