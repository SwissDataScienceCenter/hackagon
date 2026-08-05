<script lang="ts">
    import Seo from '$lib/components/layout/Seo.svelte';
    import { enhance } from '$app/forms';
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import { statusLabel } from '$lib/utils/hackathonStatus';

    const { data, form } = $props();

    const h = $derived(data.hackathon);
    const joined = $derived(Boolean(form?.joined) || data.alreadyParticipant);

    function fmt(d: Date | undefined): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    const dates = $derived.by(() => {
        const s = fmt(h.startsAt);
        const e = fmt(h.endsAt);
        if (s && e) return s === e ? s : `${s} – ${e}`;
        return s || e || '';
    });
</script>

<!-- An invitation URL is a secret: noindex, and no description either --
     an unfurled preview in a group chat would show the event to everyone in
     the room, which is exactly what a private invitation is not. -->
<Seo title="You're invited" noindex />

<section class="mx-auto w-full max-w-3xl px-4 py-12 sm:px-10">
    <p class="badge preset-tonal-primary mb-4">You've been invited</p>

    <h1 class="text-3xl font-bold sm:text-4xl">{h.name}</h1>

    <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-surface-700-300">
        {#if dates}<span>{dates}</span>{/if}
        <span class="badge preset-outlined-primary-500">{statusLabel(h.status) ?? 'Hackathon'}</span>
    </div>

    {#if h.description}
        <MarkdownSection content={h.description} />
    {/if}

    {#if form?.message}
        <p class="mt-6 text-sm text-error-500">{form.message}</p>
    {/if}

    <div class="mt-8 border-t border-surface-200-800 pt-6">
        {#if joined}
            <p class="font-semibold">You're on the list.</p>
            <p class="mt-1 text-sm text-surface-500">
                The organizers review requests and will confirm your place. You'll find
                this event on your dashboard.
            </p>
            <a href="/dashboard" class="btn preset-filled-primary-500 mt-4">Go to my dashboard</a>
        {:else if data.signedIn}
            <p class="text-sm text-surface-500">
                Requesting a place puts you on the organizers' list — they confirm who
                takes part.
            </p>
            <form method="POST" action="?/join" use:enhance class="mt-4">
                <input type="hidden" name="hackathonId" value={h.id} />
                <button type="submit" class="btn preset-filled-primary-500">
                    Request a place
                </button>
            </form>
        {:else}
            <p class="text-sm text-surface-500">
                Sign in to request a place. This invitation link stays valid — you'll
                come straight back here.
            </p>
            <!-- The action itself redirects to sign-in with returnTo, so the
                 button works whether or not a session exists. -->
            <form method="POST" action="?/join" class="mt-4">
                <input type="hidden" name="hackathonId" value={h.id} />
                <button type="submit" class="btn preset-filled-primary-500">
                    Sign in to continue
                </button>
            </form>
        {/if}
    </div>
</section>
