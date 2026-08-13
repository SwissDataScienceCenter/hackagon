<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { signIn } from '@auth/sveltekit/client';
    import { page } from '$app/state';
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import Seo from '$lib/components/layout/Seo.svelte';
    import { statusLabel } from '$lib/utils/hackathonStatus';
    import { loginDestination } from '$lib/utils/returnTo';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const h = $derived(data.hackathon);
    const membership = $derived(h.viewerMembership);

    const dates = $derived.by(() => {
        const fmt = (d: Date) =>
            new Date(d).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '';
    });

    // Three states, three different asks. The page used to offer "Register Now"
    // to everyone and point it at the member view — which is not a registration,
    // and answers 403 to anyone who has not joined.
    const cta = $derived.by(() => {
        if (membership && !membership.isWaiting) return 'member';
        if (membership?.isWaiting) return 'waiting';
        if (data.session?.user) return 'join';
        return 'anonymous';
    });
</script>

<Seo
    title={h.name}
    description={h.description ?? `${h.name} — on the SDSC hackathon platform.`}
/>

<HeroSection
    title={h.name}
    {dates}
    status={statusLabel(h.status) ?? 'Hackathon'}
    imageUrl={h.logo}
    breadcrumbs={[
        { label: 'Hackathons', href: '/hackathon' },
        { label: h.name, href: `/hackathon/${h.id}` }
    ]}
/>

<div class="mx-auto w-full max-w-7xl">
    {#if h.description}
        <MarkdownSection content={h.description} />
    {/if}

    <!-- The event's own pages, in the order its organisers put them. After the
         event this page IS the archive — the winners announcement and the
         wrap-up post live here, and they are the reason anyone follows a link
         to a finished hackathon. Headings are the page titles, so linking
         straight to "Photos & Winners" reads correctly. -->
    {#each data.pages as p (p.id)}
        <section class="px-4 pt-4 sm:px-10 md:px-20">
            <h2 class="m-0 text-title text-ink">{p.title}</h2>
        </section>
        <MarkdownSection content={p.content} />
    {/each}

    <section class="flex flex-col items-center gap-4 px-4 py-12 sm:px-10 md:px-20">
        {#if form?.message}
            <p class="m-0 text-sm text-danger-ink" role="alert">{form.message}</p>
        {/if}

        {#if cta === 'member'}
            <h2 class="m-0 text-display">You're in</h2>
            <a
                href={resolve(`/my/hackathon/${h.id}/overview`)}
                class="btn btn-solid no-underline"
            >
                Open your event view
            </a>
        {:else if cta === 'waiting'}
            <h2 class="m-0 text-display">You're on the waitlist</h2>
            {#if form?.joined && form.waitlisted && form.queuePosition}
                <!-- Fresh from the Join just made: where exactly they stand. -->
                <p class="m-0 text-sm text-ink-2" role="status">
                    You're number {form.queuePosition} in the queue.
                </p>
            {/if}
            <p class="m-0 text-sm text-ink-2">
                An organiser reviews registrations — the full event view opens once yours is
                confirmed.
            </p>
        {:else if cta === 'join'}
            <h2 class="m-0 text-display">Ready to participate?</h2>
            {#if h.maxParticipants}
                <p class="m-0 text-sm text-ink-2">
                    Places are limited ({h.maxParticipants}). Free places go
                    first-come, first-served — once the event is full, joining adds
                    you to the waiting list.
                </p>
            {:else}
                <p class="m-0 text-sm text-ink-2">
                    Joining puts you on the list. Organisers confirm participants before the event
                    opens.
                </p>
            {/if}
            <form method="POST" action="?/join" use:enhance>
                <button type="submit" class="btn btn-solid">Join this hackathon</button>
            </form>
        {:else}
            <h2 class="m-0 text-display">Ready to participate?</h2>
            <p class="m-0 text-sm text-ink-2">You need an account to join.</p>
            <!-- Back to this page after signing in, not to the dashboard: someone
                 who followed a link to an event wants that event. Through
                 loginDestination like every other callbackUrl in the app — a
                 pathname cannot be an absolute URL, but "every value that
                 becomes a callbackUrl is validated" is a rule that only holds if
                 it has no exceptions to remember. -->
            <button
                class="btn btn-solid"
                onclick={() =>
                    signIn('keycloak', { callbackUrl: loginDestination(page.url.pathname) })}
            >
                Log in to join
            </button>
        {/if}
    </section>
</div>
