<script lang="ts">
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    let confirming = $state(false);
</script>

<svelte:head><title>Your account · Hackagon</title></svelte:head>

<div class="mx-auto w-full max-w-2xl p-4 sm:p-6">
    <h1 class="text-2xl font-bold">Your account</h1>

    {#if data.user}
        <section class="card preset-outlined-surface-200-800 mt-6 p-4">
            <h2 class="font-bold">Your profile</h2>

            <!-- Display name is the platform's own field: it is what everyone
                 else sees on your projects, teams and pages. Username and email
                 belong to the sign-in provider and are re-read from your token
                 on every request, so editing them here would be undone on the
                 next page load — they link out instead. -->
            <form method="POST" action="?/profile" use:enhance class="mt-4 flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="text-sm">Display name</span>
                    <input
                        name="displayName"
                        class="input"
                        maxlength="100"
                        required
                        value={('displayName' in (form ?? {}) ? form?.displayName : undefined) ??
                            data.user.displayName ??
                            ''}
                    />
                    <span class="text-xs text-surface-500">
                        Shown next to everything you create here.
                    </span>
                </label>

                {#if form?.profileMessage}
                    <p class="text-sm text-error-500">{form.profileMessage}</p>
                {:else if form?.profileSaved}
                    <p class="text-sm text-success-500">Saved.</p>
                {/if}

                <div>
                    <button type="submit" class="btn preset-filled-primary-500">Save</button>
                </div>
            </form>

            <dl class="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-surface-200-800 pt-4 text-sm">
                <dt class="text-surface-500">Username</dt>
                <dd>{data.user.username}</dd>
                <dt class="text-surface-500">Email</dt>
                <dd class="break-all">{data.user.email || '—'}</dd>
            </dl>
            <p class="mt-3 text-xs text-surface-500">
                Your username, email and password live with your sign-in provider.
                <a href={data.identityConsoleUrl} rel="external noopener" target="_blank">
                    Change them there
                </a>
                — the new values appear here on your next sign-in.
            </p>
        </section>
    {/if}

    <section class="card preset-outlined-error-500 mt-8 p-4">
        <h2 class="font-bold">Delete your profile</h2>
        <p class="mt-2 text-sm text-surface-500">
            This removes your Hackagon profile, your place on every hackathon roster, and
            all your roles. Your sign-in account is not deleted — you can sign in again
            later and start fresh.
        </p>
        <p class="mt-2 text-sm text-surface-500">
            If you've published pages or submissions, an organizer has to reassign or
            remove them first; deleting your profile won't take other people's event
            records with it.
        </p>

        {#if form?.message}
            <p class="mt-4 text-sm text-error-500">{form.message}</p>
        {/if}

        {#if !confirming}
            <button class="btn preset-tonal-error mt-4" onclick={() => (confirming = true)}>
                Delete my profile
            </button>
        {:else}
            <form method="POST" action="?/delete" use:enhance class="mt-4 flex flex-col gap-3">
                <label>
                    <span class="text-sm">
                        Type <code class="font-semibold">{data.user?.username}</code> to confirm
                    </span>
                    <input name="confirm" class="input" autocomplete="off" required />
                </label>
                <div class="flex flex-wrap gap-2">
                    <button type="submit" class="btn preset-filled-error-500">
                        Permanently delete
                    </button>
                    <button type="button" class="btn preset-tonal" onclick={() => (confirming = false)}>
                        Cancel
                    </button>
                </div>
            </form>
        {/if}
    </section>
</div>
