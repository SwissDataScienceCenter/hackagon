<script lang="ts">
    import { enhance } from '$app/forms';
    import EmailComposer from '$lib/components/hackathon/EmailComposer.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // One row per moment, each owning its own draft and audience — rather than
    // two objects keyed by moment. Keyed lookups are how you end up with
    // `drafts[key]` possibly undefined at every use site; a row carries what it
    // needs, so the template never indexes anything.
    //
    // Edited copy is what the composer builds from, so the preview tracks what
    // you are typing rather than what was last saved — otherwise the only way
    // to see a draft addressed to the real roster is to save it first.
    //
    // Confirmed participants for every row, and deliberately not "everyone":
    // all four of these say something true only of people who are in, and
    // "Registration confirmed" sent to the waitlist tells the wrong people they
    // have a place. Widening it is one select away; the default cannot be the
    // mistake.
    let rows = $state(
        data.moments.map((m) => ({
            key: m.key,
            label: m.label,
            hint: m.hint,
            subject: m.subject,
            body: m.body,
            audienceId: 'confirmed',
        }))
    );

    const NO_ONE = { id: '', label: '', people: [] as { email: string; name: string }[] };

    // Total by construction: an unknown id addresses nobody rather than falling
    // through to whichever audience happens to be first.
    function audience(id: string) {
        return data.audiences.find((a) => a.id === id) ?? NO_ONE;
    }
</script>

<div class="flex w-full flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Notifications</h1>
        <p class="m-0 text-xs text-ink-3">
            Hackagon does not send mail. What it does is keep your copy with the event and
            hand it to your own mail client, addressed to a group that is never out of date.
        </p>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <form method="POST" action="?/save" use:enhance class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">The four moments</h2>
            <div class="flex items-center gap-3">
                {#if form?.saved}<span class="text-xs text-success-ink">Saved.</span>{/if}
                <button type="submit" class="btn btn-accent">Save copy</button>
            </div>
        </div>

        {#each rows as row (row.key)}
            <section class="card flex flex-col gap-3 p-4">
                <div class="flex flex-col gap-0.5">
                    <h3 class="m-0 text-sm font-semibold text-ink">{row.label}</h3>
                    <p class="m-0 text-meta text-ink-3">{row.hint}</p>
                </div>

                <label class="flex flex-col gap-1">
                    <span class="field-label">Subject</span>
                    <input
                        name="{row.key}Subject"
                        class="field"
                        bind:value={row.subject}
                        placeholder="You're in — {'{event}'}"
                    />
                </label>

                <label class="flex flex-col gap-1">
                    <span class="field-label">Message</span>
                    <!-- Plain text, not markdown: this is pasted into a mail
                         client, which will not render it. -->
                    <textarea
                        name={row.key}
                        class="field-area min-h-32"
                        bind:value={row.body}
                        placeholder={'Hi — your place at {event} is confirmed.'}
                    ></textarea>
                    <span class="text-meta text-ink-3">
                        {'{event}'} is filled in below. {'{team}'}, {'{project}'} and {'{name}'}
                        differ per person, so they cannot be sent to a group.
                    </span>
                </label>

                <div class="flex flex-col gap-2 border-t border-line pt-3">
                    <label class="flex flex-wrap items-center gap-2">
                        <span class="field-label m-0">Send to</span>
                        <select class="field w-auto" bind:value={row.audienceId}>
                            {#each data.audiences as a (a.id)}
                                <option value={a.id}>{a.label} ({a.people.length})</option>
                            {/each}
                        </select>
                    </label>

                    <EmailComposer
                        subject={row.subject}
                        body={row.body}
                        recipients={audience(row.audienceId).people}
                        eventName={data.eventName}
                        audienceLabel={audience(row.audienceId).label}
                    />
                </div>
            </section>
        {/each}
    </form>
</div>
