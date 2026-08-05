<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Ordered as the event runs, not alphabetically: this page is read as a
    // timeline, and a deadline out of sequence is how you set one before the
    // thing it closes has opened.
    const DEADLINES = [
        {
            name: 'registrationOpens',
            label: 'Registration opens',
            hint: 'Before this, joining is refused as "not open yet".'
        },
        {
            name: 'registrationCloses',
            label: 'Registration closes',
            hint: 'Walk-ins after this need an override below.'
        },
        { name: 'proposalsClose', label: 'Proposals close', hint: 'No new project ideas after.' },
        {
            name: 'preferencesClose',
            label: 'Preferences close',
            hint: 'Team matching reads these, so it wants them frozen.'
        },
        {
            name: 'submissionsClose',
            label: 'Submissions close',
            hint: 'The one people run at. The override exists for this.'
        }
    ] as const;

    const OVERRIDABLE = [
        { value: 'registration', label: 'Registration' },
        { value: 'proposals', label: 'Proposals' },
        { value: 'preferences', label: 'Preferences' },
        { value: 'submissions', label: 'Submissions' }
    ];
</script>

<div class="flex w-full flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Deadlines</h1>
        <p class="m-0 text-xs text-ink-3">
            The backend enforces these, so a missed deadline reads as "the deadline passed"
            rather than "you are not allowed". Leave one empty and that step never closes.
        </p>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <form method="POST" action="?/save" use:enhance class="card flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">Schedule</h2>
            {#if form?.saved}<span class="text-xs text-success-ink">Saved.</span>{/if}
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            {#each DEADLINES as d (d.name)}
                <label class="flex flex-col gap-1">
                    <span class="field-label">{d.label}</span>
                    <input
                        type="datetime-local"
                        name={d.name}
                        class="field"
                        value={data.windows[d.name]}
                    />
                    <span class="text-meta text-ink-3">{d.hint}</span>
                </label>
            {/each}
        </div>

        <label class="flex flex-col gap-1">
            <span class="field-label">Late policy</span>
            <input
                name="latePolicy"
                class="field"
                value={data.windows.latePolicy}
                placeholder="Late submissions accepted at the organisers' discretion"
            />
            <span class="text-meta text-ink-3">
                Shown to participants. Prose, not a rule the server enforces.
            </span>
        </label>

        <div>
            <button type="submit" class="btn btn-accent">Save deadlines</button>
        </div>
    </form>

    <form method="POST" action="?/override" use:enhance class="card flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">Extend a deadline now</h2>
            {#if form?.overrode}<span class="text-xs text-success-ink">Extended.</span>{/if}
        </div>
        <p class="m-0 text-meta text-ink-3">
            Adds time from <em>this moment</em>, not from the original deadline — when the
            demos overrun you want "fifteen more minutes", not arithmetic.
        </p>

        <div class="grid gap-3 sm:grid-cols-[1fr_auto_2fr_auto] sm:items-end">
            <label class="flex flex-col gap-1">
                <span class="field-label">Which</span>
                <select name="window" class="field">
                    {#each OVERRIDABLE as w (w.value)}<option value={w.value}>{w.label}</option>{/each}
                </select>
            </label>
            <label class="flex flex-col gap-1">
                <span class="field-label">Minutes</span>
                <input type="number" name="extendMinutes" class="field w-28" min="1" value="15" />
            </label>
            <label class="flex flex-col gap-1">
                <span class="field-label">Reason</span>
                <input name="reason" class="field" placeholder="AV problems during demos" />
            </label>
            <div class="pb-0.5">
                <button type="submit" class="btn">Extend</button>
            </div>
        </div>
    </form>
</div>
