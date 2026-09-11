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
    // A private hackathon confirms the joiner in `Join`, so following this link
    // is joining rather than applying, and the copy has to say which. Not
    // assumable from the route: an invite can be minted for a public hackathon
    // too, and that one still goes to the waitlist.
    const admitsOnJoin = $derived(data.autoApproves);
    // A private hackathon confirms its joiners in `Join`, so this combination
    // should not exist: on the list, yet not confirmed. It means the backend's
    // auto-approval half-failed (it logs and lets the join stand). Joining again
    // re-runs the confirmation, which is idempotent, so this is the retry.
    //
    // `data.approved` comes from a best-effort lookup that falls back to false,
    // so a failed one shows this to somebody already in. Pressing Join then is
    // harmless — the backend skips a participant who is not waiting.
    const needsRetry = $derived(onTheList && !data.approved && admitsOnJoin);
    const hasMandatory = $derived(data.questions.some((q) => q.mandatory));

    // Back to this very link after Keycloak, not to the dashboard: a private
    // hackathon they have not joined appears nowhere there, so anywhere else is
    // a dead end. Named explicitly rather than left to `returnTo`, which the
    // header's Log in reads: only the login *bounce* writes that, and this route
    // is public, so nothing bounces anybody here.
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

<!-- Shared by the first attempt and the retry inside it. The questions ride
     along both times: `Join` refuses a submission that leaves a mandatory
     answer empty, so a retry posting a bare button would come back rejected as
     invalid rather than finishing the job. -->
{#snippet joinForm(label: string)}
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
        <button type="submit" class="btn btn-sm btn-solid w-fit">{label}</button>
    </form>
{/snippet}

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
                 redirect. A confirmed member gets the link into the event
                 itself; somebody still waiting holds no role, so the event is
                 filtered out of every list they can see and this link is their
                 only way back to it. -->
            <h2 class="m-0 text-section text-ink">
                {#if data.approved}
                    You're in
                {:else if needsRetry}
                    Almost in
                {:else}
                    You're on the list
                {/if}
            </h2>
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
            {:else if needsRetry}
                <p class="m-0 text-sm text-ink-2">
                    Your place is held, but the last step did not finish — which is why
                    the event is still hidden from you. Joining again completes it.
                </p>
                {@render joinForm('Finish joining')}
            {:else}
                <p class="m-0 text-sm text-ink-2">
                    The organizers review each request and will confirm your place. Until
                    they do, this event stays hidden — so keep this link: it is how you
                    check back.
                </p>
            {/if}
        {:else if data.signedIn}
            <h2 class="m-0 text-section text-ink">
                {admitsOnJoin ? 'Take your place' : 'Ask for a place'}
            </h2>
            <p class="m-0 text-sm text-ink-2">
                {admitsOnJoin
                    ? 'This invitation is your place — accepting it puts you straight in.'
                    : "This puts you on the organizers' list. They decide who takes part."}
            </p>

            {@render joinForm(admitsOnJoin ? 'Join' : 'Request a place')}
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
