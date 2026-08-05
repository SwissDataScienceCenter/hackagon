<script lang="ts">
    /**
     * Turns a stored email template into something an organizer can actually
     * send. Hackagon has no notification service, so the realistic path is
     * "open my own mail client" or "paste into whatever I use" — this builds
     * both, rather than leaving the copy inert in the database.
     */
    interface Recipient {
        email: string;
        name: string;
    }

    let {
        subject = '',
        body = '',
        recipients = [],
        eventName = '',
        audienceLabel = '',
    }: {
        subject?: string;
        body?: string;
        recipients?: Recipient[];
        eventName?: string;
        audienceLabel?: string;
    } = $props();

    // Templates carry placeholders in the organizer's own copy. {event} is the
    // only one knowable for a whole audience at once — {team}, {project} and
    // {window} differ per recipient, so they are surfaced as a warning rather
    // than silently sent as literal braces.
    const PER_RECIPIENT = /\{(team|project|window|name)\}/g;

    function fill(text: string): string {
        return text.replaceAll('{event}', eventName);
    }

    const filledSubject = $derived(fill(subject));
    const filledBody = $derived(fill(body));

    const unresolved = $derived.by(() => {
        const found = new Set<string>();
        for (const m of `${filledSubject}\n${filledBody}`.matchAll(PER_RECIPIENT)) {
            found.add(m[0]);
        }
        return [...found];
    });

    const addresses = $derived(recipients.map((r) => r.email).filter(Boolean));

    // Recipients go in BCC: a hackathon roster is personal data, and putting
    // 40 addresses in To: would disclose every participant to every other one.
    const mailto = $derived(
        `mailto:?bcc=${encodeURIComponent(addresses.join(','))}` +
            `&subject=${encodeURIComponent(filledSubject)}` +
            `&body=${encodeURIComponent(filledBody)}`
    );

    // Mail clients and browsers truncate long mailto: URLs, and a silently
    // truncated recipient list is worse than no link at all.
    const tooLong = $derived(mailto.length > 1800);

    let copied = $state<string | null>(null);

    async function copy(what: string, text: string) {
        try {
            await navigator.clipboard.writeText(text);
            copied = what;
            setTimeout(() => (copied = null), 2000);
        } catch {
            copied = null; // clipboard blocked; the text below is selectable
        }
    }
</script>

<div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="badge preset-tonal-primary">{addresses.length} recipient{addresses.length === 1 ? '' : 's'}</span>
        {#if audienceLabel}<span class="text-surface-500">{audienceLabel}</span>{/if}
        {#if recipients.length !== addresses.length}
            <span class="badge preset-tonal-warning">
                {recipients.length - addresses.length} without an email address
            </span>
        {/if}
    </div>

    {#if unresolved.length > 0}
        <p class="card preset-tonal-warning p-3 text-xs">
            This template still contains {unresolved.join(', ')} — those differ per
            person, so they cannot be filled in for a whole group. Edit them out, or
            send this one team at a time.
        </p>
    {/if}

    {#if addresses.length === 0}
        <p class="text-sm text-surface-500">
            Nobody in this group has an email address on file yet.
        </p>
    {:else}
        <div class="flex flex-wrap gap-2">
            {#if tooLong}
                <span class="badge preset-tonal-warning">
                    Too many recipients for a mail link — use the copy buttons
                </span>
            {:else}
                <a href={mailto} class="btn btn-sm preset-filled-primary-500">
                    Open in email client
                </a>
            {/if}
            <button class="btn btn-sm preset-tonal" onclick={() => copy('to', addresses.join(', '))}>
                {copied === 'to' ? 'Copied' : 'Copy recipients'}
            </button>
            <button class="btn btn-sm preset-tonal" onclick={() => copy('subject', filledSubject)}>
                {copied === 'subject' ? 'Copied' : 'Copy subject'}
            </button>
            <button class="btn btn-sm preset-tonal" onclick={() => copy('body', filledBody)}>
                {copied === 'body' ? 'Copied' : 'Copy message'}
            </button>
        </div>

        <details class="card preset-outlined-surface-200-800 p-3">
            <summary class="cursor-pointer text-sm font-medium">Preview</summary>
            <dl class="mt-3 flex flex-col gap-2 text-sm">
                <dt class="text-xs font-semibold text-surface-500">BCC</dt>
                <dd class="max-h-24 overflow-y-auto break-all font-mono text-xs">
                    {addresses.join(', ')}
                </dd>
                <dt class="text-xs font-semibold text-surface-500">Subject</dt>
                <dd>{filledSubject || '(no subject set)'}</dd>
                <dt class="text-xs font-semibold text-surface-500">Message</dt>
                <dd class="whitespace-pre-wrap">{filledBody || '(no message set)'}</dd>
            </dl>
        </details>
    {/if}
</div>
