<script lang="ts">
    import { enhance } from '$app/forms';
    import Plus from 'lucide-svelte/icons/plus';
    import Trash2 from 'lucide-svelte/icons/trash-2';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Mirrored client-side so rows can be added and removed. The form still
    // posts parallel arrays, so it degrades to whatever rows are on the page if
    // JavaScript never arrives.
    const TYPES = ['text', 'textarea', 'url', 'email', 'tags', 'file-or-url'];

    type FieldRow = { key: string; label: string; type: string; required: boolean };
    type ConsentRow = { key: string; label: string; required: boolean };

    let regFields = $state<FieldRow[]>(
        data.registration.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type || 'text',
            required: f.required
        }))
    );
    let regConsents = $state<ConsentRow[]>(
        data.registration.consents.map((c) => ({
            key: c.key,
            label: c.label,
            required: c.required
        }))
    );
    let subFields = $state<FieldRow[]>(
        data.submission.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type || 'text',
            required: f.required
        }))
    );

    const blankField = (): FieldRow => ({ key: '', label: '', type: 'text', required: false });
    const blankConsent = (): ConsentRow => ({ key: '', label: '', required: false });
</script>

{#snippet fieldRows(rows: FieldRow[], remove: (i: number) => void)}
    {#each rows as row, i (i)}
        <div class="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto_auto] sm:items-end">
            <label class="flex flex-col gap-1">
                <span class="field-label">Key</span>
                <!-- The key addresses the answer, so it is what the export and
                     every stored response are keyed by. Changing it later
                     orphans the answers already given. -->
                <input name="fieldKey" class="field" bind:value={row.key} placeholder="affiliation" />
            </label>
            <label class="flex flex-col gap-1">
                <span class="field-label">Question</span>
                <input name="fieldLabel" class="field" bind:value={row.label} placeholder="Affiliation" />
            </label>
            <label class="flex flex-col gap-1">
                <span class="field-label">Type</span>
                <select name="fieldType" class="field" bind:value={row.type}>
                    {#each TYPES as t (t)}<option value={t}>{t}</option>{/each}
                </select>
            </label>
            <label class="flex items-center gap-2 pb-2">
                <input type="checkbox" bind:checked={row.required} />
                <span class="field-label">Required</span>
                <input type="hidden" name="fieldRequired" value={row.required ? 'true' : 'false'} />
            </label>
            <button
                type="button"
                class="btn btn-icon btn-sm btn-quiet"
                aria-label="Remove question"
                onclick={() => remove(i)}
            >
                <Trash2 class="h-4 w-4" />
            </button>
        </div>
    {/each}
{/snippet}

<div class="flex w-full flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Forms</h1>
        <p class="m-0 text-xs text-ink-3">
            What this event asks people — when they register, and when their team turns work
            in. Saving replaces the whole form, so every row on this page is submitted.
        </p>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <!-- ── Registration ─────────────────────────────────────────── -->
    <form method="POST" action="?/registration" use:enhance class="card flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">Registration form</h2>
            {#if form?.savedRegistration}
                <span class="text-xs text-success-ink">Saved.</span>
            {/if}
        </div>

        {@render fieldRows(regFields, (i) => (regFields = regFields.filter((_, n) => n !== i)))}

        <div>
            <button type="button" class="btn btn-sm" onclick={() => (regFields = [...regFields, blankField()])}>
                <Plus class="h-4 w-4" /> Add question
            </button>
        </div>

        <div class="flex flex-col gap-2 border-t border-line pt-4">
            <h3 class="m-0 text-sm font-semibold text-ink">Consents</h3>
            <p class="m-0 text-meta text-ink-3">
                Tick-boxes a registrant answers yes or no to. A required one blocks
                registration until it is ticked — a code of conduct, typically.
            </p>

            {#each regConsents as row, i (i)}
                <div class="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
                    <label class="flex flex-col gap-1">
                        <span class="field-label">Key</span>
                        <input name="consentKey" class="field" bind:value={row.key} placeholder="conduct" />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="field-label">Statement</span>
                        <input
                            name="consentLabel"
                            class="field"
                            bind:value={row.label}
                            placeholder="I accept the Code of Conduct"
                        />
                    </label>
                    <label class="flex items-center gap-2 pb-2">
                        <input type="checkbox" bind:checked={row.required} />
                        <span class="field-label">Required</span>
                        <input type="hidden" name="consentRequired" value={row.required ? 'true' : 'false'} />
                    </label>
                    <button
                        type="button"
                        class="btn btn-icon btn-sm btn-quiet"
                        aria-label="Remove consent"
                        onclick={() => (regConsents = regConsents.filter((_, n) => n !== i))}
                    >
                        <Trash2 class="h-4 w-4" />
                    </button>
                </div>
            {/each}

            <div>
                <button
                    type="button"
                    class="btn btn-sm"
                    onclick={() => (regConsents = [...regConsents, blankConsent()])}
                >
                    <Plus class="h-4 w-4" /> Add consent
                </button>
            </div>
        </div>

        <div>
            <button type="submit" class="btn btn-accent">Save registration form</button>
        </div>
    </form>

    <!-- ── Submission ───────────────────────────────────────────── -->
    <form method="POST" action="?/submission" use:enhance class="card flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">Submission form</h2>
            {#if form?.savedSubmission}
                <span class="text-xs text-success-ink">Saved.</span>
            {/if}
        </div>
        <p class="m-0 text-meta text-ink-3">
            Answered per team when they submit. A required field the team leaves out is
            rejected by the backend, so this is the contract for what counts as finished work.
        </p>

        {@render fieldRows(subFields, (i) => (subFields = subFields.filter((_, n) => n !== i)))}

        <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" onclick={() => (subFields = [...subFields, blankField()])}>
                <Plus class="h-4 w-4" /> Add question
            </button>
            <button type="submit" class="btn btn-accent">Save submission form</button>
        </div>
    </form>
</div>
