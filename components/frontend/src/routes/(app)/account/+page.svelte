<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import CircleHelp from 'lucide-svelte/icons/circle-help';
    import KeyRound from 'lucide-svelte/icons/key-round';
    import Link from 'lucide-svelte/icons/link';
    import Mail from 'lucide-svelte/icons/mail';
    import X from 'lucide-svelte/icons/x';
    import { startEmailChange, startPasswordChange } from '$lib/utils/account';
    import { PROFILE_LINK_KINDS } from '$lib/utils/profileLinks';
    import type { ActionData, PageData } from './$types';

    // The identity card reads the session the root layout hands every route. The
    // links come from this page's own load, which makes no RPC either: it reads
    // the backend user that `hooks.server.ts` already fetched.
    let { data, form }: { data: PageData; form: ActionData } = $props();

    let saving = $state(false);

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

    <!-- Unlike the two rows above, these are Hackagon's own: a form posted here,
         not a trip to the sign-in service — so the explanation sits in the card
         rather than in the help panel, which is about that trip. Save is the
         page's one solid action, being the only one that submits anything. -->
    <section class="card flex flex-col gap-3 p-4" aria-labelledby="profile-links-heading">
        <div class="flex items-center gap-3">
            <span
                class="flex size-9 shrink-0 items-center justify-center rounded-field
                       bg-info/10 text-info-ink"
                aria-hidden="true"
            >
                <Link class="h-4 w-4" />
            </span>
            <h2 id="profile-links-heading" class="m-0 flex-1 text-section">Profile links</h2>
        </div>

        <p class="prose m-0 text-xs text-ink-3">
            Shown to the other participants of hackathons you join. Leave a box empty to remove
            that link.
        </p>

        {#if data.links === null}
            <p class="m-0 text-xs text-ink-3">
                Your links cannot be loaded right now. Reload the page in a moment.
            </p>
        {:else}
            <form
                method="POST"
                action="?/links"
                class="flex flex-col gap-3"
                use:enhance={() => {
                    saving = true;
                    // Not reset: a refused save keeps what was typed, and a
                    // successful one reruns the load, whose fresh links re-key the
                    // boxes below.
                    return async ({ update }) => {
                        await update({ reset: false });
                        saving = false;
                    };
                }}
            >
                <!-- Re-keyed on every load, so after a save each box shows the link
                     as the backend now renders it — `www.` and trailing slashes
                     dropped — even where that matches what the box held before. -->
                {#key data.links}
                    {#each PROFILE_LINK_KINDS as kind (kind.key)}
                        <label class="field-label">
                            {kind.label}
                            <input
                                type="url"
                                name={kind.key}
                                value={form?.values?.[kind.key] ?? data.links[kind.key]}
                                placeholder={kind.example}
                                maxlength="2048"
                                spellcheck="false"
                                class="field"
                            />
                        </label>
                    {/each}
                {/key}

                {#if form?.message}
                    <p
                        class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2
                               text-xs text-danger-ink"
                        role="alert"
                    >
                        {form.message}
                    </p>
                {/if}

                <div class="flex items-center gap-3">
                    <button type="submit" class="btn btn-solid" disabled={saving}>
                        {saving ? 'Saving…' : 'Save links'}
                    </button>
                    <span class="text-xs text-success-ink" role="status">
                        {form?.saved && !saving ? 'Saved' : ''}
                    </span>
                </div>
            </form>
        {/if}
    </section>
</div>
