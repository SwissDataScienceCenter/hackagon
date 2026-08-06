<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';
    import {
        submissionStatusLabel,
        submissionStatusBadgeVariant,
    } from '$lib/utils/submissionStatus';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /** SubmissionStatus: DRAFT=1, FINAL=2 */
    const FINAL = 2;

    // Which team's "new version" form is open. Closed by default: the page is
    // read first and written rarely, and a team with a submission already in
    // should have to ask before replacing it.
    let composing = $state<string | null>(null);

    // Finalising is irreversible, so it asks — one click away from freezing the
    // thing the whole event is judged on is one click too few.
    let confirmingFinalize = $state<string | null>(null);

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    // A closed window is a clock, not a refusal — say which, and when it changes.
    const gate = $derived(data.submissionsGate);
    const gateNote = $derived.by(() => {
        if (gate.open) return '';
        if (gate.state === 1)
            return gate.opensAt
                ? `Submissions open ${formatDate(gate.opensAt)}.`
                : 'Submissions are not open yet.';
        return gate.closesAt
            ? `Submissions closed ${formatDate(gate.closesAt)}. An organiser can extend the deadline.`
            : 'Submissions are closed. An organiser can reopen them.';
    });
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Submissions</h2>
        <span class="text-xs text-ink-3">Your team's submitted work</span>
    </div>

    {#if form?.message}
        <p class="m-0 text-sm text-danger-ink" role="alert">{form.message}</p>
    {/if}

    {#if gateNote}
        <p class="m-0 text-xs text-warning-ink">{gateNote}</p>
    {/if}

    {#if data.groups.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            No teams have been formed yet, so there is nothing to submit.
        </p>
    {:else}
        {#each data.groups as group (group.teamId)}
            <div
                class="card card-raised box-border w-full px-5 py-4"
            >
                <div class="flex flex-col gap-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="m-0 text-sm leading-snug text-ink">
                            {group.teamName}
                        </h3>
                        <!-- The page lists every team — members read all
                             submissions hackathon-wide — so yours has to be
                             findable among them. -->
                        {#if group.isMine}
                            <span class="badge badge-accent">Your team</span>
                        {/if}
                    </div>
                    <span class="text-xs text-ink-3">{group.projectTitle}</span>
                </div>

                {#if !group.latest}
                    <p class="mt-3 mb-0 text-xs text-ink-3">
                        No submission yet.
                    </p>
                    {#if gate.open && group.isMine}
                        <div class="mt-3">
                            <button
                                class="btn btn-sm btn-accent"
                                onclick={() => (composing = group.teamId)}
                            >
                                Submit your work
                            </button>
                        </div>
                    {/if}
                {:else}
                    <div class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-semibold text-ink">
                                Version {group.latest.version}
                            </span>
                            <span
                                class="badge {submissionStatusBadgeVariant(group.latest.status) ??
                                    'badge-neutral'}"
                            >
                                {submissionStatusLabel(group.latest.status) ?? 'Unknown'}
                            </span>
                            <span class="text-xs text-ink-3">
                                {formatDate(group.latest.modifiedAt ?? group.latest.createdAt)}
                            </span>
                        </div>
                        {#if group.latest.result}
                            <p class="m-0 text-xs leading-snug text-ink-2">
                                {group.latest.result}
                            </p>
                        {/if}

                        {#if group.latest.status !== FINAL && gate.open && group.isMine}
                            <!-- Editing changes THIS version's description in
                                 place; the structured answers are fixed at
                                 create, and a new version is how you change
                                 those. -->
                            <form
                                method="POST"
                                action="?/edit"
                                use:enhance
                                class="mt-2 flex flex-col gap-2"
                            >
                                <input
                                    type="hidden"
                                    name="submissionId"
                                    value={group.latest.id}
                                />
                                <label class="flex flex-col gap-1">
                                    <span class="field-label">What you turned in</span>
                                    <textarea
                                        name="result"
                                        class="field-area min-h-20"
                                        value={group.latest.result}
                                        placeholder="Repository link, demo URL, what works and what does not."
                                    ></textarea>
                                </label>
                                <div class="flex flex-wrap gap-2">
                                    <button type="submit" class="btn btn-sm">Save changes</button>
                                    <button
                                        type="button"
                                        class="btn btn-sm"
                                        onclick={() => (composing = group.teamId)}
                                    >
                                        New version
                                    </button>
                                    {#if confirmingFinalize !== group.latest.id}
                                        <button
                                            type="button"
                                            class="btn btn-sm btn-accent"
                                            onclick={() =>
                                                (confirmingFinalize = group.latest?.id ?? null)}
                                        >
                                            Finalise…
                                        </button>
                                    {/if}
                                </div>
                            </form>

                            {#if confirmingFinalize === group.latest.id}
                                <!-- Its own form: nesting one inside the edit
                                     form is invalid HTML, and this must not
                                     carry the edit's fields. -->
                                <form
                                    method="POST"
                                    action="?/finalize"
                                    use:enhance
                                    class="flex flex-col gap-2 border-t border-line pt-2"
                                >
                                    <input
                                        type="hidden"
                                        name="submissionId"
                                        value={group.latest.id}
                                    />
                                    <p class="m-0 text-meta text-ink-3">
                                        Finalising freezes this version — it is what the vote
                                        sees, and it cannot be edited afterwards.
                                    </p>
                                    <div class="flex flex-wrap gap-2">
                                        <button type="submit" class="btn btn-sm btn-accent">
                                            Yes, finalise
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-sm"
                                            onclick={() => (confirmingFinalize = null)}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            {/if}
                        {/if}
                    </div>

                    {#if group.earlier.length > 0}
                        <details class="mt-3 border-t border-line pt-3">
                            <summary class="cursor-pointer text-xs text-ink-3">
                                {group.earlier.length === 1
                                    ? '1 earlier version'
                                    : `${group.earlier.length} earlier versions`}
                            </summary>
                            <ul class="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                                {#each group.earlier as submission (submission.id)}
                                    <li class="flex flex-wrap items-center gap-2">
                                        <span class="text-xs text-ink-2">
                                            Version {submission.version}
                                        </span>
                                        <span
                                            class="badge {submissionStatusBadgeVariant(
                                                submission.status
                                            ) ?? 'badge-neutral'}"
                                        >
                                            {submissionStatusLabel(submission.status) ?? 'Unknown'}
                                        </span>
                                        <span class="text-xs text-ink-3">
                                            {formatDate(submission.modifiedAt ?? submission.createdAt)}
                                        </span>
                                    </li>
                                {/each}
                            </ul>
                        </details>
                    {/if}
                {/if}

                {#if composing === group.teamId && group.isMine}
                    <!-- Every submission is a NEW VERSION: the backend numbers
                         them and keeps the earlier ones, so this is never an
                         overwrite even when it replaces what counts. -->
                    <form
                        method="POST"
                        action="?/create"
                        use:enhance={() =>
                            async ({ update }) => {
                                await update();
                                composing = null;
                            }}
                        class="mt-3 flex flex-col gap-3 border-t border-line pt-3"
                    >
                        <input type="hidden" name="teamId" value={group.teamId} />
                        <input type="hidden" name="projectId" value={group.projectId} />

                        <h4 class="m-0 text-sm font-semibold text-ink">
                            {group.latest ? `Version ${group.latest.version + 1}` : 'Your submission'}
                        </h4>

                        <label class="flex flex-col gap-1">
                            <span class="field-label">What you turned in</span>
                            <textarea
                                name="result"
                                class="field-area min-h-24"
                                placeholder="Repository link, demo URL, what works and what does not."
                            ></textarea>
                        </label>

                        {#if data.submissionFields.length > 0}
                            <!-- The organiser's own questions, rendered from the
                                 schema on the hackathon. The backend validates
                                 the same schema and names the offending field,
                                 so a mismatch here is reported, not silent. -->
                            {#each data.submissionFields as field (field.key)}
                                <label class="flex flex-col gap-1">
                                    <span class="field-label">
                                        {field.label || field.key}
                                        {#if field.required}<span class="text-danger-ink">*</span>{/if}
                                    </span>
                                    {#if field.type === 'textarea'}
                                        <textarea
                                            name="field:{field.key}"
                                            class="field-area min-h-20"
                                            required={field.required}
                                        ></textarea>
                                    {:else}
                                        <input
                                            name="field:{field.key}"
                                            class="field"
                                            required={field.required}
                                        />
                                    {/if}
                                </label>
                            {/each}
                        {/if}

                        <div class="flex flex-wrap gap-2">
                            <button type="submit" class="btn btn-sm btn-accent">
                                Submit
                            </button>
                            <button
                                type="button"
                                class="btn btn-sm"
                                onclick={() => (composing = null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                {/if}
            </div>
        {/each}
    {/if}
</div>
