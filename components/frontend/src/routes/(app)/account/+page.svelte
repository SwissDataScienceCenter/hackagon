<script lang="ts">
    import { resolve } from '$app/paths';
    import CircleHelp from 'lucide-svelte/icons/circle-help';
    import KeyRound from 'lucide-svelte/icons/key-round';
    import Mail from 'lucide-svelte/icons/mail';
    import X from 'lucide-svelte/icons/x';
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
    // $lib/utils/account. Both come back to this page whether the user saves or
    // cancels — which is also why there is no confirmation banner below:
    // nothing here can tell those two apart.
    const changePassword = () => startPasswordChange(resolve('/(app)/account'));
    const changeEmail = () => startEmailChange(resolve('/(app)/account'));

    // Closed by default, as on Manage Teams: whoever needs the details asks for
    // them, and everyone else should not have to read past them.
    let helpOpen = $state(false);
</script>

<svelte:head>
    <title>Account · Hackagon</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
            <a
                href={resolve('/(app)/dashboard')}
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                &larr; Back to dashboard
            </a>
            <h1 class="m-0 text-title text-ink">Account</h1>
        </div>

        <button
            type="button"
            class="btn btn-sm btn-quiet"
            aria-expanded={helpOpen}
            aria-controls="account-help"
            onclick={() => (helpOpen = !helpOpen)}
        >
            <CircleHelp class="size-3" />
            How changing your email and password works
        </button>
    </div>

    {#if helpOpen}
        <section id="account-help" class="card card-raised flex flex-col gap-3 p-3 text-xs">
            <div class="flex items-start gap-3">
                <h3 class="m-0 flex-1 meta">How changing your email and password works</h3>
                <button
                    type="button"
                    class="shrink-0 text-ink-3 hover:text-ink"
                    aria-label="Close"
                    onclick={() => (helpOpen = false)}
                >
                    <X class="size-3" />
                </button>
            </div>

            <div class="flex flex-col gap-1 text-ink-2">
                <p class="m-0">
                    Your password and email are held by the sign-in service, not by Hackagon. Both
                    buttons take you there and ask you to sign in once more first; you come back
                    here when you are done, or if you cancel.
                </p>
                <p class="m-0">The email form also lets you correct your name.</p>
                <p class="m-0">
                    Nothing is sent to a new email address to confirm it, so check it carefully:
                    it is where hackathon organizers will reach you, and you can sign in with it.
                </p>
            </div>
        </section>
    {/if}

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

    <section class="card flex items-center gap-3 p-4">
        <span
            class="flex size-9 shrink-0 items-center justify-center rounded-field
                   bg-info/10 text-info-ink"
            aria-hidden="true"
        >
            <KeyRound class="h-4 w-4" />
        </span>
        <h2 class="m-0 flex-1 text-section">Password</h2>
        <button onclick={changePassword} class="btn btn-outline">Change password</button>
    </section>

    <section class="card flex items-center gap-3 p-4">
        <span
            class="flex size-9 shrink-0 items-center justify-center rounded-field
                   bg-info/10 text-info-ink"
            aria-hidden="true"
        >
            <Mail class="h-4 w-4" />
        </span>
        <h2 class="m-0 flex-1 text-section">Email</h2>
        <button onclick={changeEmail} class="btn btn-outline">Change email</button>
    </section>
</div>
