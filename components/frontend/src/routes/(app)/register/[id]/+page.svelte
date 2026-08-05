<script lang="ts">
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    // Sent as a hidden field so the action knows which consents exist: an
    // unchecked box submits nothing, so "not given" is otherwise
    // indistinguishable from "the organizer never asked".
    const consentKeys = $derived(data.consents.map((c) => c.key).join(','));

    function inputType(t: string): string {
        // The organizer types this freely; only map the ones that change the
        // control, and fall back to text so an unknown type still works.
        if (t === 'url' || t === 'file-or-url') return 'url';
        if (t === 'email') return 'email';
        return 'text';
    }
</script>

<svelte:head><title>Registration · {data.name}</title></svelte:head>

<div class="mx-auto w-full max-w-2xl p-4 sm:p-6">
    <h1 class="text-2xl font-bold">{data.alreadySubmitted ? 'Your registration' : 'Registration'}</h1>
    <p class="mt-1 text-sm text-surface-500">{data.name}</p>

    {#if form?.submitted}
        <div class="card preset-tonal-success mt-6 p-4">
            <p class="font-semibold">Thanks — your answers are in.</p>
            <p class="mt-1 text-sm">
                The organizers review registrations and will confirm your place. You can come
                back to this page and change your answers at any time.
            </p>
            <a href="/dashboard" class="btn preset-filled-primary-500 mt-4">Back to my dashboard</a>
        </div>
    {:else}
        {#if data.alreadySubmitted}
            <p class="mt-4 text-sm text-surface-500">
                You've already filled this in — your answers are below. Change anything you
                like and save; the organizers see the latest version.
            </p>
        {/if}
        {#if form?.message}
            <p class="mt-4 text-sm text-error-500">{form.message}</p>
        {/if}

        <form method="POST" use:enhance class="mt-6 flex flex-col gap-5">
            <input type="hidden" name="consentKeys" value={consentKeys} />

            {#each data.fields as f (f.key)}
                <label>
                    <span class="text-sm font-medium">
                        {f.label}
                        {#if f.required}<span class="text-error-500">*</span>{/if}
                    </span>
                    {#if f.type === 'tags'}
                        <input
                            name="field:{f.key}" class="input" required={f.required}
                            placeholder="Comma-separated"
                            value={data.answers[f.key] ?? ''}
                        />
                    {:else}
                        <input
                            name="field:{f.key}" class="input" type={inputType(f.type)}
                            required={f.required}
                            value={data.answers[f.key] ?? ''}
                        />
                    {/if}
                    {#if f.type === 'file-or-url'}
                        <span class="text-xs text-surface-500">
                            Paste a link — file uploads aren't supported yet.
                        </span>
                    {/if}
                </label>
            {/each}

            {#each data.consents as c (c.key)}
                <label class="flex items-start gap-2">
                    <input
                        name="consent:{c.key}" type="checkbox" class="checkbox mt-1"
                        required={c.required}
                        checked={data.consentValues[c.key] ?? false}
                    />
                    <span class="text-sm">
                        {c.label}
                        {#if c.required}<span class="text-error-500">*</span>{/if}
                    </span>
                </label>
            {/each}

            <div class="flex flex-wrap gap-3">
                <button type="submit" class="btn preset-filled-primary-500">
                    {data.alreadySubmitted ? 'Save changes' : 'Submit registration'}
                </button>
                <a href="/dashboard" class="btn preset-tonal">Cancel</a>
            </div>
        </form>
    {/if}
</div>
