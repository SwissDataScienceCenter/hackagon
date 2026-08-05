<script lang="ts">
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    let confirming = $state(false);
</script>

<svelte:head><title>Your account · Hackagon</title></svelte:head>

<div class="mx-auto w-full max-w-2xl p-4 sm:p-6">
    <h1 class="text-2xl font-bold">Your account</h1>

    {#if data.user}
        <div class="card preset-outlined-surface-200-800 mt-6 p-4">
            <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt class="text-surface-500">Name</dt>
                <dd>{data.user.displayName || '—'}</dd>
                <dt class="text-surface-500">Username</dt>
                <dd>{data.user.username}</dd>
                <dt class="text-surface-500">Email</dt>
                <dd class="break-all">{data.user.email || '—'}</dd>
            </dl>
            <p class="mt-4 text-xs text-surface-500">
                These come from your sign-in provider. Change them there and they'll update
                here on your next sign-in.
            </p>
        </div>
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
