<script lang="ts">
    // UserPlus, not the Mail of CtaSection: this section asks the reader to sign
    // up for something, not to get in touch about it.
    import { UserPlus } from 'lucide-svelte';
    import { signIn } from '@auth/sveltekit/client';
    import { resolve } from '$app/paths';
    import { isFinished } from '$lib/utils/hackathonStatus';
    import {
        membershipBadgeLabel,
        membershipBadgeVariant,
    } from '$lib/utils/hackathonRole';

    let {
        hackathonId,
        name,
        status,
        signedIn,
        standing = 'none',
    }: {
        hackathonId: string;
        name: string;
        /** Raw HackathonStatus number, as the loader returns it. */
        status: number;
        /**
         * This visitor's relationship to the hackathon, which is the only thing
         * that changes between the page a stranger sees and the page somebody
         * already registered sees. A member never reaches this block — their way
         * in sits under the hero, because navigation is not a call to action.
         */
        standing?: 'member' | 'waiting' | 'none';
        /**
         * A session that can actually call the backend — not merely a cookie
         * carrying an identity. The loader decides this with `usableSession`, so
         * somebody holding a dead token is offered sign-in, which is the one
         * control that fixes it.
         */
        signedIn: boolean;
    } = $props();

    // Back to this very page after Keycloak rather than to the dashboard: they
    // came to register for *this* hackathon, and the button that does it is the
    // one standing here when they return. The invitation page names its own URL
    // for the same reason.
    const returnHere = $derived(`/hackathon/${hackathonId}`);
</script>

<!-- A finished hackathon gets no CTA at all — not a disabled button and not a
     note. The hero's own "Finished" badge is already the reason there is no way
     in, and saying it twice reads as a fault. Same rule the dashboard's Join
     column follows. -->
{#if !isFinished(status)}
    <section
        class="flex flex-col items-center gap-4 border-t border-line px-4 py-12
               sm:px-10 md:px-20"
    >
        <h2 class="text-display">
            {standing === 'waiting' ? 'You have registered for ' + name : 'Take part in ' + name}
        </h2>

        {#if standing === 'waiting'}
            <!-- The same chip the dashboard row carries, so the word and the
                 colour for this state are decided in one place. The role
                 argument is inert while waiting — `membershipBadgeLabel`
                 answers "Waitlisted" whatever it is given — but it is passed
                 rather than dropped so the helper keeps one shape. -->
            <span class="badge {membershipBadgeVariant(true)}">
                {membershipBadgeLabel(true, 0)}
            </span>
            <p class="text-sm text-ink-2">
                You are on the waiting list. The organizers confirm who takes part,
                and you will find {name} under "Your hackathons" once they do.
            </p>
            <!-- Quiet, because it is not what this page is for: the answers are
                 what the organizers read to decide, so a mistyped one is worth
                 being able to correct while waiting. Saving comes straight back
                 here. -->
            <a
                href={resolve(`/register/${hackathonId}`)}
                class="btn btn-ghost btn-sm no-underline"
            >
                Review your answers
            </a>
        {:else if signedIn}
            <p class="text-sm text-ink-2">
                Registering puts you on the organizers' list. They confirm who takes part.
            </p>
            <!-- Straight to the registration form rather than joining from here.
                 That page is the one place that knows both halves of signing up:
                 it answers the hackathon's questions if it asks any, and offers a
                 bare "Join" if it does not. Posting a join from this page would
                 need a second copy of its gRPC error handling, and a hackathon
                 with mandatory questions would refuse it anyway. -->
            <a
                href={resolve(`/register/${hackathonId}`)}
                class="btn btn-solid no-underline"
            >
                <UserPlus class="h-4 w-4" />
                Register
            </a>
        {:else}
            <p class="text-sm text-ink-2">
                You need an account to register. You'll come straight back to this page.
            </p>
            <!-- A button, not a link: signing in is a client-side Auth.js call,
                 and it is the only way to name where to return to.

                 One control for both halves of "register or log in". Keycloak's
                 own login screen carries the "Register" link — the realm sets
                 `registrationAllowed: true` — so the fork happens there, on the
                 page that owns account creation, rather than here with a second
                 button pointing at an endpoint nothing else in the app knows. -->
            <button
                type="button"
                class="btn btn-solid"
                onclick={() => signIn('keycloak', { callbackUrl: returnHere })}
            >
                <UserPlus class="h-4 w-4" />
                Sign in or create an account
            </button>
        {/if}
    </section>
{/if}
