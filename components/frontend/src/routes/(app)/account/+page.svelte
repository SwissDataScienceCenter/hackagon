<script lang="ts">
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    let confirming = $state(false);
</script>

<svelte:head><title>Your account · Hackagon</title></svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-10">
    <h1 class="m-0 text-title text-ink">Your account</h1>

    {#if data.user}
        <section class="card flex flex-col gap-4 p-4">
            <h2 class="m-0 text-section text-ink">Your profile</h2>

            <!-- Display name is the platform's own field: it is what everyone
                 else sees on your projects, teams and pages. Username and email
                 belong to the sign-in provider and are re-read from your token
                 on every request, so editing them here would be undone on the
                 next page load — they link out instead. -->
            <form method="POST" action="?/profile" use:enhance class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="field-label">Display name</span>
                    <input
                        name="displayName"
                        class="field"
                        maxlength="100"
                        required
                        value={('displayName' in (form ?? {}) ? form?.displayName : undefined) ??
                            data.user.displayName ??
                            ''}
                    />
                    <span class="text-meta text-ink-3">
                        Shown next to everything you create here.
                    </span>
                </label>

                {#if form?.profileMessage}
                    <p class="m-0 text-xs text-danger-ink" role="alert">{form.profileMessage}</p>
                {:else if form?.profileSaved}
                    <p class="m-0 text-xs text-success-ink">Saved.</p>
                {/if}

                <div>
                    <button type="submit" class="btn btn-accent">Save</button>
                </div>
            </form>

            <dl
                class="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-4 text-sm"
            >
                <dt class="text-ink-3">Username</dt>
                <dd class="m-0 text-ink">{data.user.username}</dd>
                <dt class="text-ink-3">Email</dt>
                <dd class="m-0 break-all text-ink">{data.user.email || '—'}</dd>
            </dl>

            <p class="m-0 text-meta text-ink-3">
                Your username, email and password live with your sign-in provider.
                <a href={data.identityConsoleUrl} rel="external noopener" target="_blank">
                    Change them there
                </a>
                — the new values appear here on your next sign-in.
            </p>
        </section>
    {/if}

    <section class="card flex flex-col gap-3 border-danger p-4">
        <h2 class="m-0 text-section text-ink">Delete your profile</h2>
        <p class="m-0 text-sm text-ink-2">
            This removes your Hackagon profile, your place on every hackathon roster, and all
            your roles. Your sign-in account is not deleted — you can sign in again later and
            start fresh.
        </p>
        <p class="m-0 text-sm text-ink-3">
            If you've published pages or submissions, an organiser has to reassign or remove
            them first; deleting your profile won't take other people's event records with it.
        </p>

        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        {#if !confirming}
            <div>
                <button class="btn btn-danger" onclick={() => (confirming = true)}>
                    Delete my profile
                </button>
            </div>
        {:else}
            <form method="POST" action="?/delete" use:enhance class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="field-label">
                        Type <code class="font-semibold text-ink">{data.user?.username}</code> to
                        confirm
                    </span>
                    <input name="confirm" class="field" autocomplete="off" required />
                </label>
                <div class="flex flex-wrap gap-2">
                    <button type="submit" class="btn btn-danger-solid">Permanently delete</button>
                    <button type="button" class="btn" onclick={() => (confirming = false)}>
                        Cancel
                    </button>
                </div>
            </form>
        {/if}
    </section>
</div>
