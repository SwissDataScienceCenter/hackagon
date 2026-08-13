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
    <h1 class="text-2xl font-bold">
        {#if data.readOnly}{data.targetName}'s registration{:else}{data.alreadySubmitted ? 'Your registration' : 'Registration'}{/if}
    </h1>
    <p class="mt-1 text-sm text-ink-3">{data.name}</p>

    {#if data.readOnly}
        <!-- An organizer reading a participant's answers for catering and
             check-in. Read-only: these are someone else's answers, so the
             fields are shown as text and there is nothing to submit. -->
        {#if !data.alreadySubmitted}
            <p class="mt-6 text-sm text-ink-3">No response yet.</p>
        {:else}
            <dl class="mt-6 flex flex-col gap-5">
                {#each data.fields as f (f.key)}
                    <div>
                        <dt class="text-sm font-medium">{f.label}</dt>
                        <dd class="mt-1 text-sm text-ink-2">
                            {data.answers[f.key] || '—'}
                        </dd>
                    </div>
                {/each}
                {#each data.consents as c (c.key)}
                    <div class="flex items-start gap-2">
                        <input
                            type="checkbox" class="mt-1" disabled
                            checked={data.consentValues[c.key] ?? false}
                        />
                        <span class="text-sm">{c.label}</span>
                    </div>
                {/each}
            </dl>
        {/if}
    {:else if form?.submitted}
        <div class="card border-success mt-6 p-4">
            <p class="font-semibold">Thanks — your answers are in.</p>
            <p class="mt-1 text-sm">
                The organizers review registrations and will confirm your place. You can come
                back to this page and change your answers at any time.
            </p>
            <a href="/dashboard" class="btn btn-accent mt-4">Back to my dashboard</a>
        </div>
    {:else}
        {#if data.alreadySubmitted}
            <p class="mt-4 text-sm text-ink-3">
                You've already filled this in — your answers are below. Change anything you
                like and save; the organizers see the latest version.
            </p>
        {/if}
        {#if form?.message}
            <p class="mt-4 text-sm text-danger-ink">{form.message}</p>
        {/if}

        <form method="POST" use:enhance class="mt-6 flex flex-col gap-5">
            <input type="hidden" name="consentKeys" value={consentKeys} />

            {#each data.fields as f (f.key)}
                <label>
                    <span class="text-sm font-medium">
                        {f.label}
                        {#if f.required}<span class="text-danger-ink">*</span>{/if}
                    </span>
                    {#if f.type === 'tags'}
                        <input
                            name="field:{f.key}" class="field" required={f.required}
                            placeholder="Comma-separated"
                            value={data.answers[f.key] ?? ''}
                        />
                    {:else}
                        <input
                            name="field:{f.key}" class="field" type={inputType(f.type)}
                            required={f.required}
                            value={data.answers[f.key] ?? ''}
                        />
                    {/if}
                    {#if f.type === 'file-or-url'}
                        <span class="text-xs text-ink-3">
                            Paste a link — file uploads aren't supported yet.
                        </span>
                    {/if}
                </label>
            {/each}

            {#each data.consents as c (c.key)}
                <label class="flex items-start gap-2">
                    <input
                        name="consent:{c.key}" type="checkbox" class="mt-1"
                        required={c.required}
                        checked={data.consentValues[c.key] ?? false}
                    />
                    <span class="text-sm">
                        {c.label}
                        {#if c.required}<span class="text-danger-ink">*</span>{/if}
                    </span>
                </label>
            {/each}

            <div class="flex flex-wrap gap-3">
                <button type="submit" class="btn btn-accent">
                    {data.alreadySubmitted ? 'Save changes' : 'Submit registration'}
                </button>
                <a href="/dashboard" class="btn">Cancel</a>
            </div>
        </form>
    {/if}
</div>
