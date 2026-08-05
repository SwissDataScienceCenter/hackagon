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
    } = $props();

    const FIELD_CLASS =
        'h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950 px-3 text-xs ' +
        'text-surface-950-50 placeholder:text-surface-700-300 focus:border-primary-500 ' +
        'focus:outline-none';
    const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-semibold text-surface-500';

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
        <p class="m-0 text-xs text-error-500" role="alert">{message}</p>
    {/if}

    <div class="grid gap-4 sm:grid-cols-2">
        <label class="{LABEL_CLASS} sm:col-span-2">
            Name
            <input
                type="text"
                name="name"
                required
                minlength="3"
                maxlength="255"
                value={phase.name}
                placeholder="Ideation"
                class={FIELD_CLASS}
            />
        </label>

        {#if datesEditable}
            <label class={LABEL_CLASS}>
                Starts
                <input
                    type="datetime-local"
                    name="startsAt"
                    value={toDateTimeLocal(phase.startsAt)}
                    class={FIELD_CLASS}
                />
            </label>

            <label class={LABEL_CLASS}>
                Ends
                <input
                    type="datetime-local"
                    name="endsAt"
                    value={toDateTimeLocal(phase.endsAt)}
                    class={FIELD_CLASS}
                />
            </label>

            <span class="text-xs font-normal text-surface-500 sm:col-span-2">
                {#if hasDates}
                    Set both or neither. Dates can be changed but not removed.
                {:else}
                    Set both or leave both empty — a phase can be scheduled later.
                {/if}
            </span>
        {:else}
            <span class="text-xs font-normal text-surface-500 sm:col-span-2">
                Dates are set after the phase exists — save it, then use Edit on the
                timeline to schedule it.
            </span>
        {/if}

        {#if pages.length > 0}
            <label class="{LABEL_CLASS} sm:col-span-2">
                Linked page (optional)
                <select name="pageId" class={FIELD_CLASS}>
                    <option value="">No page</option>
                    {#each pages as p (p.id)}
                        <option value={p.id} selected={p.id === phase.pageId}>
                            {p.title}
                        </option>
                    {/each}
                </select>
                <span class="font-normal text-surface-500">
                    Participants can open this page from the timeline.
                </span>
            </label>
        {/if}
    </div>

    <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="p-0 text-xs font-semibold text-surface-500">
            What happens in this phase
        </legend>
        <!-- Labels, not switches. Tagging a phase grants nobody anything: what
             participants may actually do lives on HackathonState and is turned on
             separately. See PHASE_CAPABILITIES in $lib/utils/phase. -->
        <p class="m-0 text-xs font-normal text-surface-500">
            Describes the phase for participants. It does not turn these actions on
            or off — that stays a separate decision.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
            {#each PHASE_CAPABILITIES as capability (capability.value)}
                <label class="flex items-center gap-2 text-xs text-surface-950-50">
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
    <div class="{LABEL_CLASS} w-full">
        <label for="phase-description">Description</label>
        <MarkdownEditor
            id="phase-description"
            name="description"
            value={phase.description}
            rows={12}
            required
            placeholder="What should participants be doing in this phase?"
        />
    </div>

    <div class="flex gap-2">
        <button type="submit" class="btn btn-sm preset-filled-primary-500">{submitLabel}</button>
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(cancelHref as any)} class="btn btn-sm preset-tonal-surface no-underline">
            Cancel
        </a>
    </div>
</form>
