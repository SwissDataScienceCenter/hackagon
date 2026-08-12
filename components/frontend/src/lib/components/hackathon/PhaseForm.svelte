<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import { PHASE_CAPABILITIES, toDateTimeLocal } from '$lib/utils/phase';

    let {
        phase,
        pages,
        cancelHref,
        submitLabel,
        message,
        datesEditable = true,
        uploadEndpoint,
        browseEndpoint = undefined,
    }: {
        phase: {
            name: string;
            description: string;
            startsAt?: Date;
            endsAt?: Date;
            /** Empty string when the phase links no page. */
            pageId: string;
            /** Raw `Capability` enum numbers, as `PHASE_CAPABILITIES` lists them. */
            capabilities: number[];
        };
        pages: { id: string; title: string }[];
        /** Unresolved path — `resolve()` is called here, at the anchor. */
        cancelHref: string;
        submitLabel: string;
        /** Failure text from the action, if the last submit failed. */
        message?: string;
        /**
         * Whether to offer the date fields. False on create — see the TODO in
         * `timeline/new/+page.server.ts`: `PhaseService.Create` accepts dates and
         * silently discards them, so offering the fields there would lose what an
         * organizer typed without telling them.
         */
        datesEditable?: boolean;
        /** Presign endpoint for inline image uploads; see MarkdownEditor. */
        uploadEndpoint?: string;
        /** Listing endpoint for the picker's "already uploaded" half.
         *  Forwarded to MarkdownEditor; omit it for upload-only. */
        browseEndpoint?: string;
    } = $props();

    // See the TODO in the calling +page.server.ts: `Edit` sets dates but never
    // clears them, so a phase that already has them cannot be returned to
    // undated. Saying so beats a field that silently ignores being emptied.
    const hasDates = $derived(phase.startsAt !== undefined || phase.endsAt !== undefined);
</script>

<!-- Server-side validation only: every rule here is one the action repeats, and
     the action is what the backend actually sees.

     The `?/save` action name is part of this component's contract — any page
     using it must expose an action by that name. -->
<form method="POST" action="?/save" class="flex w-full flex-col gap-6">
    {#if message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{message}</p>
    {/if}

    <div class="grid gap-4 sm:grid-cols-2">
        <label class="field-label sm:col-span-2">
            Name
            <input
                type="text"
                name="name"
                required
                minlength="3"
                maxlength="255"
                value={phase.name}
                placeholder="Ideation"
                class="field"
            />
        </label>

        {#if datesEditable}
            <label class="field-label">
                Starts
                <input
                    type="datetime-local"
                    name="startsAt"
                    value={toDateTimeLocal(phase.startsAt)}
                    class="field"
                />
            </label>

            <label class="field-label">
                Ends
                <input
                    type="datetime-local"
                    name="endsAt"
                    value={toDateTimeLocal(phase.endsAt)}
                    class="field"
                />
            </label>

            <span class="text-xs font-normal text-ink-3 sm:col-span-2">
                {#if hasDates}
                    Set both or neither. Dates can be changed but not removed.
                {:else}
                    Set both or leave both empty — a phase can be scheduled later.
                {/if}
            </span>
        {:else}
            <span class="text-xs font-normal text-ink-3 sm:col-span-2">
                Dates are set after the phase exists — save it, then use Edit on the
                timeline to schedule it.
            </span>
        {/if}

        {#if pages.length > 0}
            <label class="field-label sm:col-span-2">
                Linked page (optional)
                <select name="pageId" class="field">
                    <option value="">No page</option>
                    {#each pages as p (p.id)}
                        <option value={p.id} selected={p.id === phase.pageId}>
                            {p.title}
                        </option>
                    {/each}
                </select>
                <span class="font-normal text-ink-3">
                    Participants can open this page from the timeline.
                </span>
            </label>
        {/if}
    </div>

    <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="p-0 text-xs font-semibold text-ink-3">
            What happens in this phase
        </legend>
        <!-- Labels, not switches. Tagging a phase grants nobody anything: what
             participants may actually do lives on HackathonState and is turned on
             separately. See PHASE_CAPABILITIES in $lib/utils/phase. -->
        <p class="m-0 text-xs font-normal text-ink-3">
            Describes the phase for participants. It does not turn these actions on
            or off — that stays a separate decision.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
            {#each PHASE_CAPABILITIES as capability (capability.value)}
                <label class="flex items-center gap-2 text-xs text-ink">
                    <input
                        type="checkbox"
                        name="capabilities"
                        value={capability.value}
                        checked={phase.capabilities.includes(capability.value)}
                        class="checkbox"
                    />
                    {capability.label}
                </label>
            {/each}
        </div>
    </fieldset>

    <!-- Last and full width: the only field with no natural size, and the one
         where the room is worth having for the source and its preview both. -->
    <div class="field-label w-full">
        <label for="phase-description">Description</label>
        <MarkdownEditor
            id="phase-description"
            name="description"
            value={phase.description}
            rows={12}
            required
            placeholder="What should participants be doing in this phase?"
            {uploadEndpoint}
            {browseEndpoint}
        />
    </div>

    <div class="flex gap-2">
        <button type="submit" class="btn btn-sm btn-solid">{submitLabel}</button>
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(cancelHref as any)} class="btn btn-sm btn-ghost no-underline">
            Cancel
        </a>
    </div>
</form>
