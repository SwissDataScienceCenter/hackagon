<script lang="ts">
    import { resolve } from '$app/paths';
    import KeyRound from 'lucide-svelte/icons/key-round';
    import Mail from 'lucide-svelte/icons/mail';
    import { startEmailChange, startPasswordChange } from '$lib/utils/account';
    import type { PageData } from './$types';

    // No loader of its own: everything shown here is already on the session that
    // the root layout hands every route. An RPC would only re-fetch what the
    // cookie already says.
    let { data }: { data: PageData } = $props();

    const user = $derived(data.session?.user);
    const userName = $derived(user?.name ?? user?.email ?? 'You');
    const initial = $derived(userName.charAt(0).toUpperCase());

    // The mechanism, and why it is a redirect rather than a form, lives in
    // $lib/utils/account. It comes back to this page whether the user sets a new
    // password or cancels — which is also why there is no confirmation banner
    // below: nothing here can tell those two apart.
    const changePassword = () => startPasswordChange(resolve('/(app)/account'));
    const changeEmail = () => startEmailChange(resolve('/(app)/account'));
</script>

<svelte:head>
    <title>Account · Hackagon</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <a
            href={resolve('/(app)/dashboard')}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to dashboard
        </a>
        <h1 class="m-0 text-title text-ink">Account</h1>
    </div>

    <!-- Which account, before the controls that change it. The monogram is
         the header's, at the header's size, so the row reads as the same
         identity rather than a second one. -->
    <section class="card flex items-center gap-3 p-4">
        <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field
                   border border-line-strong bg-raised text-sm font-semibold text-ink-2"
            aria-hidden="true"
        >
            {initial}
        </span>
        <div class="flex min-w-0 flex-col">
            <span class="meta">Signed in as</span>
            <span class="truncate text-sm font-medium text-ink">{userName}</span>
            {#if user?.email && user.email !== userName}
                <span class="truncate text-xs text-ink-3">{user.email}</span>
            {/if}
        </div>
    </section>

    <section class="card flex flex-col gap-3 p-4">
        <div class="flex items-center gap-3">
            <span
                class="flex size-9 shrink-0 items-center justify-center rounded-field
                       bg-info/10 text-info-ink"
                aria-hidden="true"
            >
                <KeyRound class="h-4 w-4" />
            </span>
            <h2 class="m-0 text-section">Password</h2>
        </div>

        <!-- Says what is about to happen, because it is a redirect off the app
             onto a page that looks nothing like it, and it asks for the current
             password on the way. Without the warning that re-prompt reads as
             having been signed out mid-task. -->
        <p class="prose m-0 text-sm text-ink-2">
            Your password is held by the sign-in service, not by Hackagon. Changing it takes
            you there and asks you to sign in once more first; you will come back here when
            you are done, or if you cancel.
        </p>

        <div>
            <button onclick={changePassword} class="btn btn-solid">Change password</button>
        </div>

        <!-- The gap named rather than hidden. There is no self-service reset:
             the realm sets resetPasswordAllowed false because it has no mail
             server, and Keycloak only ever delivers a reset link by email. So
             somebody locked out cannot be sent anywhere — they have to be told
             who can set a new password for them, which is a platform
             administrator and deliberately nobody else, since a credential is
             platform-wide and a hackathon role is not. -->
        <p class="prose m-0 text-xs text-ink-3">
            Forgotten your password? There is no self-service reset yet — ask a platform
            administrator to set a new one for you.
        </p>
    </section>

    <section class="card flex flex-col gap-3 p-4">
        <div class="flex items-center gap-3">
            <span
                class="flex size-9 shrink-0 items-center justify-center rounded-field
                       bg-info/10 text-info-ink"
                aria-hidden="true"
            >
                <Mail class="h-4 w-4" />
            </span>
            <h2 class="m-0 text-section">Email</h2>
        </div>

        <!-- Same trip as the password above, onto Keycloak's profile form,
             which also holds the name — so it says so, rather than surprising
             the user with two more fields. -->
        <p class="prose m-0 text-sm text-ink-2">
            Your email is held by the sign-in service too. Changing it takes you there and asks
            you to sign in once more first; the same form also lets you correct your name.
        </p>

        <div>
            <!-- Outline, not solid: the page's one solid action is the password. -->
            <button onclick={changeEmail} class="btn btn-outline">Change email</button>
        </div>

        <!-- The gap named rather than hidden. With no mail server the realm
             cannot send a confirmation, so a mistyped address is simply saved —
             and it is the one organizers will write to, and one the user can
             sign in with. -->
        <p class="prose m-0 text-xs text-ink-3">
            Nothing is sent to the new address to confirm it, so check it carefully: it is
            where hackathon organizers will reach you, and you can sign in with it.
        </p>
    </section>
</div>
