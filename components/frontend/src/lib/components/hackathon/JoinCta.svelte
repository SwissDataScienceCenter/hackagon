<script lang="ts">
    // UserPlus, not the Mail of CtaSection: this asks the reader to sign up for
    // something, not to get in touch about it.
    import { UserPlus } from 'lucide-svelte';
    import ArrowRight from 'lucide-svelte/icons/arrow-right';
    import { signIn } from '@auth/sveltekit/client';
    import { resolve } from '$app/paths';
    import { isFinished } from '$lib/utils/hackathonStatus';
    import { membershipBadgeLabel, membershipBadgeVariant } from '$lib/utils/hackathonRole';

    let {
        hackathonId,
        status,
        signedIn,
        standing = 'none',
    }: {
        hackathonId: string;
        /** Raw HackathonStatus number, as the loader returns it. */
        status: number;
        /**
         * A session that can actually call the backend — not merely a cookie
         * carrying an identity. The loader decides this with `usableSession`, so
         * somebody holding a dead token is offered sign-in, which is the one
         * control that fixes it.
         */
        signedIn: boolean;
        /**
         * This reader's relationship to the hackathon, which is the only thing
         * that changes between the page a stranger sees and the page somebody
         * already registered sees.
         */
        standing?: 'member' | 'waiting' | 'none';
    } = $props();

    // Back to this very page after Keycloak rather than to the dashboard: they
    // came to register for *this* hackathon, and the control that does it is the
    // one standing here when they return.
    const returnHere = $derived(`/hackathon/${hackathonId}`);

    // A finished hackathon offers no way in — the hero's own badge is already the
    // reason, and saying it twice reads as a fault. A member is the exception:
    // their hackathon does not stop being theirs when it ends.
    const show = $derived(standing === 'member' || !isFinished(status));
</script>

<!--
  One bar, directly under the hero, whatever the reader's standing.

  It used to be a full section at the foot of the page under a display-sized
  heading that repeated the hackathon's name three lines below the hero already
  saying it. Worse, it put a member's way in below the whole of the organiser's
  description — so the one reader who was not deciding anything had the furthest
  to scroll. Everyone's control is in the same place now, at the same weight.
-->
{#if show}
    <div
        class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b
               border-line px-4 py-3 sm:px-10 md:px-20"
    >
        {#if standing === 'member'}
            <span class="badge {membershipBadgeVariant(false)}">
                {membershipBadgeLabel(false, 0)}
            </span>
            <a
                href={resolve(`/my/hackathon/${hackathonId}/overview`)}
                class="btn btn-sm btn-solid no-underline"
            >
                Enter the hackathon
                <ArrowRight class="h-4 w-4" />
            </a>
        {:else if standing === 'waiting'}
            <span class="badge {membershipBadgeVariant(true)}">
                {membershipBadgeLabel(true, 0)}
            </span>
            <p class="m-0 font-sans text-sm text-ink-2">
                The organizers confirm who takes part.
            </p>
            <!-- Quiet: the answers are what the organizers read to decide, so a
                 mistyped one is worth correcting while waiting, but correcting it
                 is not what this page is for. -->
            <a
                href={resolve(`/register/${hackathonId}`)}
                class="btn btn-sm btn-ghost no-underline"
            >
                Review your answers
            </a>
        {:else if signedIn}
            <p class="m-0 font-sans text-sm text-ink-2">
                Registering puts you on the organizers' list.
            </p>
            <!-- Straight to the registration form rather than joining from here.
                 That page is the one place that knows both halves of signing up:
                 it answers the hackathon's questions if it asks any, and offers a
                 bare "Join" if it does not. -->
            <a
                href={resolve(`/register/${hackathonId}`)}
                class="btn btn-sm btn-solid no-underline"
            >
                <UserPlus class="h-4 w-4" />
                Register
            </a>
        {:else}
            <p class="m-0 font-sans text-sm text-ink-2">
                You need an account to register. You'll come straight back here.
            </p>
            <!-- A button, not a link: signing in is a client-side Auth.js call,
                 and it is the only way to name where to return to. Keycloak's own
                 screen carries the "Register" link, so the fork happens there. -->
            <button
                type="button"
                class="btn btn-sm btn-solid"
                onclick={() => signIn('keycloak', { callbackUrl: returnHere })}
            >
                <UserPlus class="h-4 w-4" />
                Sign in or create an account
            </button>
        {/if}
    </div>
{/if}
