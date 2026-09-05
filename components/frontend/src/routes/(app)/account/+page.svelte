<script lang="ts">
    import { resolve } from '$app/paths';
    import KeyRound from 'lucide-svelte/icons/key-round';
    import { startPasswordChange } from '$lib/utils/account';
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

    <!-- Which account, before the one control that changes it. The monogram is
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

        <!-- The gap named rather than hidden: there is no self-service reset
             because the realm has no mail server, so somebody locked out has to
             be told who can actually help them. -->
        <p class="prose m-0 text-xs text-ink-3">
            Forgotten your password? There is no self-service reset yet — ask a platform
            administrator to set a new one for you.
        </p>
    </section>
</div>
