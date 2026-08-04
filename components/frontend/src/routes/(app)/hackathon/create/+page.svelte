<script lang="ts">
    import { enhance } from '$app/forms';

    const { form } = $props();

    // Private events are invitation-only, so say so at the point of choosing —
    // it is the difference between "anyone can register" and "you must hand
    // out links yourself".
    let isPrivate = $state(false);
</script>

<svelte:head><title>New hackathon · Hackagon</title></svelte:head>

<div class="mx-auto w-full max-w-3xl p-4 sm:p-6">
    <h1 class="text-2xl font-bold">Create a hackathon</h1>
    <p class="mt-1 text-sm text-surface-500">
        You'll be its owner. Dates, pages and participants can all be changed afterwards
        — only the name is needed to get started.
    </p>

    {#if form?.message}
        <p class="mt-4 text-sm text-error-500">{form.message}</p>
    {/if}

    <form method="POST" use:enhance class="mt-6 flex flex-col gap-5">
        <label>
            <span class="text-sm font-medium">Name</span>
            <input
                name="name"
                class="input"
                required
                minlength="3"
                maxlength="255"
                placeholder="SDSC Open Research Data Hackathon 2027"
                value={form?.values?.name ?? ''}
            />
        </label>

        <div class="flex flex-col gap-4 sm:flex-row">
            <label class="flex-1">
                <span class="text-sm font-medium">Starts</span>
                <input name="startsAt" type="datetime-local" class="input" />
            </label>
            <label class="flex-1">
                <span class="text-sm font-medium">Ends</span>
                <input name="endsAt" type="datetime-local" class="input" />
            </label>
        </div>
        <p class="-mt-3 text-xs text-surface-500">
            Set both or neither. An event without dates stays in planning and never shows
            as finished.
        </p>

        <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium">Who can find it</legend>
            <label class="flex items-start gap-2">
                <input
                    type="radio" name="visibility" value="public" class="radio mt-1"
                    checked={!isPrivate} onchange={() => (isPrivate = false)}
                />
                <span>
                    <span class="font-medium">Public</span>
                    <span class="block text-xs text-surface-500">
                        Listed on the home page; anyone with an account can register.
                    </span>
                </span>
            </label>
            <label class="flex items-start gap-2">
                <input
                    type="radio" name="visibility" value="private" class="radio mt-1"
                    checked={isPrivate} onchange={() => (isPrivate = true)}
                />
                <span>
                    <span class="font-medium">Private</span>
                    <span class="block text-xs text-surface-500">
                        Hidden from listings and search. People join only through an
                        invitation link you generate.
                    </span>
                </span>
            </label>
        </fieldset>

        {#if isPrivate}
            <p class="card preset-tonal-warning p-3 text-xs">
                You'll need to generate an invitation link after creating the event —
                nobody can find a private hackathon on their own.
            </p>
        {/if}

        <label>
            <span class="text-sm font-medium">Description <span class="text-surface-500">(optional, markdown)</span></span>
            <textarea
                name="description" class="textarea min-h-40" rows="8" maxlength="10000"
                placeholder="What the event is about, who it's for, what people will build."
            ></textarea>
        </label>

        <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn preset-filled-primary-500">Create hackathon</button>
            <a href="/dashboard" class="btn preset-tonal">Cancel</a>
        </div>
    </form>
</div>
