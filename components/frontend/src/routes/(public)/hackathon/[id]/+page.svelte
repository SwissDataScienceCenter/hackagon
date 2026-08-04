<script lang="ts">
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';
    import { statusLabel } from '$lib/utils/hackathonStatus';

    const { data } = $props();

    // `locked` means: signed in, but this id is private or gone. The two are
    // deliberately indistinguishable so nobody can probe UUIDs for private
    // events — the copy below has to serve a real invitee either way.
    const h = $derived(data.hackathon!);

    // HackathonStatus: UNSPECIFIED=0, PENDING=1, ACTIVE=2, FINISHED=3
    const isFinished = $derived(h.status === 3);

    function fmt(d: Date | undefined): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    const dates = $derived.by(() => {
        const start = fmt(h.startsAt);
        const end = fmt(h.endsAt);
        if (start && end) return start === end ? start : `${start} – ${end}`;
        return start || end || '';
    });
</script>

<!-- One head block: svelte:head may not sit inside a block. -->
<svelte:head>
    <title>{data.locked ? 'Private event' : h.name} · Hackagon</title>
    {#if !data.locked && h.description}
        <meta name="description" content={h.description.slice(0, 200)} />
    {/if}
</svelte:head>

{#if data.locked}
    <section class="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-10">
        <h1 class="text-2xl font-bold sm:text-3xl">This event is private or no longer available</h1>
        <p class="mt-4 text-surface-700-300">
            You're signed in, but this event isn't open to everyone.
        </p>
        <div class="card preset-outlined-surface-200-800 mt-8 p-6 text-left">
            <h2 class="font-bold">Were you invited?</h2>
            <p class="mt-2 text-sm text-surface-500">
                Private events are joined through an invitation link, which the organizers
                send by email. Open that link and you'll be able to request a place — this
                page won't let you in on its own.
            </p>
            <h2 class="mt-6 font-bold">Looking for something to join?</h2>
            <p class="mt-2 text-sm text-surface-500">
                Public hackathons are open to anyone with an account — you can register for
                them yourself.
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
                <a href="/" class="btn preset-filled-primary-500">Browse public hackathons</a>
                <a href="/dashboard" class="btn preset-tonal">My dashboard</a>
            </div>
        </div>
    </section>
{:else}

<!-- Everything here comes from the backend. Venue and capacity are NOT in the
     schema, so the hero simply omits them rather than showing invented values. -->
<HeroSection
    title={h.name}
    {dates}
    status={statusLabel(h.status) ?? 'Hackathon'}
    imageUrl={h.logo || '/images/hackathon-ord-2024/ambiance/ambiance_1.jpg'}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: h.name, href: `/hackathon/${h.id}` },
    ]}
/>

<div class="mx-auto w-full max-w-7xl">
    {#if h.description}
        <MarkdownSection content={h.description} />
    {/if}

    {#if data.pages.length > 0}
        <section class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-10">
            <h2 class="mb-6 text-2xl font-bold">News &amp; Pages</h2>
            {#each data.pages as p (p.id)}
                <article class="mb-8">
                    <h3 class="mb-2 text-xl font-semibold">{p.title}</h3>
                    <MarkdownSection content={p.content} />
                </article>
            {/each}
        </section>
    {/if}

    {#if !h.description && data.pages.length === 0}
        <section class="mx-auto w-full max-w-4xl px-4 py-12 text-center sm:px-10">
            <p class="text-surface-500">
                The organizers haven't published details for this event yet.
            </p>
        </section>
    {/if}

    <CtaSection
        heading={isFinished ? 'Missed this one?' : 'Want to take part?'}
        subtitle={isFinished
            ? 'Browse the other hackathons on the platform — new events are announced regularly.'
            : 'Sign in to register for this hackathon and join a team.'}
        buttonLabel={isFinished ? 'Browse hackathons' : 'Sign in to register'}
        buttonHref={isFinished ? '/' : '/dashboard'}
        note=""
    />
</div>
{/if}
