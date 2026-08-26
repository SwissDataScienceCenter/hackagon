<script lang="ts">
    import { signIn } from '@auth/sveltekit/client';
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import QuestionField from '$lib/components/hackathon/QuestionField.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { statusLabel } from '$lib/utils/hackathonStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const h = $derived(data.hackathon);
    // Either they just asked, or they had already asked before this visit. The
    // page reads the same both ways: what matters is that they are on the list.
    const onTheList = $derived(Boolean(form?.joined) || data.alreadyParticipant);
    const hasMandatory = $derived(data.questions.some((q) => q.mandatory));

    // Back to this very link after Keycloak, not to the dashboard: a private
    // hackathon they have not joined appears nowhere there, so anywhere else is
    // a dead end. `returnTo` is not used — the app writes it but nothing reads
    // it — so the callback is named explicitly.
    const returnHere = $derived(`/invite/${data.token}`);
</script>

<svelte:head>
    <!-- An invitation URL is a secret. `noindex` keeps it out of search, and the
         deliberate absence of any description or og: tag keeps it out of the
         unfurled preview a chat app would otherwise paste into the room — which
         would show a private event to everyone in it. -->
    <title>You're invited</title>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-10">
    <div class="flex flex-col gap-3">
        <span class="badge badge-info w-fit">You've been invited</span>
        <h1 class="m-0 text-title text-ink">{h.name}</h1>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
            {#if formatDateRange(h)}
                <span class="tnum">{formatDateRange(h)}</span>
            {/if}
            {#if statusLabel(h.status)}
                <span class="badge badge-neutral">{statusLabel(h.status)}</span>
            {/if}
        </div>
    </div>

    {#if h.description}
        <MarkdownContent content={h.description} />
    {/if}

    {#if form?.message}
        <p class="m-0 text-sm text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <div class="flex flex-col gap-3 border-t border-line pt-6">
        {#if onTheList}
            <!-- The end of the road for this page, and deliberately not a
                 redirect: until an organiser approves them they hold no role
                 here, so this private event is filtered out of every list they
                 can see. This link is their only way back to it. -->
            <h2 class="m-0 text-section text-ink">You're on the list</h2>
            {#if data.approved}
                <p class="m-0 text-sm text-ink-2">
                    Your place is confirmed. The event is on your dashboard now.
                </p>
                <a
                    href={resolve(`/my/hackathon/${h.id}/overview`)}
                    class="btn btn-sm btn-solid w-fit no-underline"
                >
                    Open {h.name}
                </a>
            {:else}
                <p class="m-0 text-sm text-ink-2">
                    The organizers review each request and will confirm your place. Until
                    they do, this event stays hidden — so keep this link: it is how you
                    check back.
                </p>
            {/if}
        {:else if data.signedIn}
            <h2 class="m-0 text-section text-ink">Ask for a place</h2>
            <p class="m-0 text-sm text-ink-2">
                This puts you on the organizers' list. They decide who takes part.
            </p>

            <form method="POST" action="?/join" class="flex flex-col gap-5">
                {#if data.questions.length > 0}
                    <section class="card flex flex-col gap-5 px-5 py-4">
                        <span class="meta">A few questions first</span>
                        {#each data.questions as question (question.id)}
                            <QuestionField {question} />
                        {/each}
                        {#if hasMandatory}
                            <p class="m-0 text-meta text-ink-3">
                                <span class="text-danger-ink" aria-hidden="true">*</span>
                                Required.
                            </p>
                        {/if}
                    </section>
                {/if}
                <button type="submit" class="btn btn-sm btn-solid w-fit">
                    Request a place
                </button>
            </form>
        {:else}
            <h2 class="m-0 text-section text-ink">Sign in to continue</h2>
            <p class="m-0 text-sm text-ink-2">
                You need an account to ask for a place. This link keeps working — you'll
                come straight back here.
            </p>
            <!-- A button, not a link: signing in is a client-side Auth.js call,
                 and it is the only way to name where to return to. -->
            <button
                type="button"
                class="btn btn-sm btn-solid w-fit"
                onclick={() => signIn('keycloak', { callbackUrl: returnHere })}
            >
                Sign in to continue
            </button>
        {/if}
    </div>
</section>
