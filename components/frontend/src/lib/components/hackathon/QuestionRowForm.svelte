<script lang="ts">
    import { QUESTION_KINDS, kindNeedsOptions, type QuestionKind } from '$lib/utils/question';

    let {
        question,
        action,
        submitLabel,
        keyEditable = false
    }: {
        question: {
            /** Absent on the new-question row. */
            id?: string;
            key: string;
            label: string;
            kind: QuestionKind;
            mandatory: boolean;
            order: number;
            options: string[];
            publicAnswers: boolean;
            answerCount: number;
        };
        /** The named action this row posts to, e.g. `?/edit`. */
        action: string;
        submitLabel: string;
        /** Only the new-question row may set a key; `EditQuestion` has no such field. */
        keyEditable?: boolean;
    } = $props();

    // Local, so the options box appears the moment the type changes rather than
    // after a round trip.
    let kind = $state(question.kind);

    // A question people have already answered has a fixed type and a fixed
    // options list, and cannot be promoted to mandatory — the backend refuses
    // each of the three. The controls stay on screen but stop accepting input,
    // so an organizer can still read what they chose.
    //
    // Who may read the answers is deliberately *not* one of them: `EditQuestion`
    // accepts `public_answers` on an answered question, which is what lets a
    // question shared by mistake be taken back.
    //
    // Disabled inputs submit nothing, so the two that are disabled carry a hidden
    // mirror of their current value: the server-side parser validates every row
    // the same way, and the action decides what to actually send from its own
    // count of the answers rather than from anything here.
    const locked = $derived(question.answerCount > 0);

    // Newlines in an attribute have to come from the script: a mustache holding
    // only a string literal trips svelte/no-useless-mustaches.
    const optionsPlaceholder = 'S\nM\nL';
</script>

<form method="POST" {action} class="flex flex-col gap-3">
    {#if question.id}
        <input type="hidden" name="questionId" value={question.id} />
    {/if}

    <div class="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label class="field-label">
            Key
            <!-- Names the answers, so it is what an export uses as a column
                 heading and cannot be changed once the question exists. -->
            <input
                type="text"
                name="key"
                required
                maxlength="64"
                pattern="[a-z][a-z0-9_]*"
                value={question.key}
                readonly={!keyEditable}
                placeholder="affiliation"
                class="field"
                aria-describedby={keyEditable ? 'key-hint' : undefined}
            />
            {#if keyEditable}
                <span id="key-hint" class="text-meta text-ink-3">
                    Lowercase letters, digits and underscores. Cannot be changed later.
                </span>
            {/if}
        </label>

        <label class="field-label">
            Question
            <input
                type="text"
                name="label"
                required
                maxlength="255"
                value={question.label}
                placeholder="Which university or company are you with?"
                class="field"
            />
        </label>
    </div>

    <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label class="field-label">
            Answer type
            <select name="kind" bind:value={kind} disabled={locked} class="field">
                {#each QUESTION_KINDS as k (k.value)}
                    <option value={k.value}>{k.label}</option>
                {/each}
            </select>
            <span class="text-meta text-ink-3">
                {QUESTION_KINDS.find((k) => k.value === kind)?.hint}
            </span>
        </label>
        {#if locked}
            <input type="hidden" name="kind" value={question.kind} />
        {/if}

        <label class="field-label">
            Position
            <input
                type="number"
                name="order"
                min="0"
                step="1"
                value={question.order}
                class="field w-24 tnum"
            />
        </label>

        <label class="flex items-center gap-2 pt-6">
            <input
                type="checkbox"
                name="mandatory"
                value="true"
                checked={question.mandatory}
                disabled={locked}
                class="checkbox"
            />
            <span class="field-label">Required</span>
        </label>
        {#if locked && question.mandatory}
            <input type="hidden" name="mandatory" value="true" />
        {/if}
    </div>

    <label class="flex items-start gap-2">
        <input
            type="checkbox"
            name="publicAnswers"
            value="true"
            checked={question.publicAnswers}
            class="checkbox mt-0.5 shrink-0"
        />
        <span class="flex flex-col gap-0.5">
            <span class="field-label">Show answers to participants</span>
            <span class="text-meta text-ink-3">
                Everyone in the hackathon sees what each person answered, on their
                profile. Leave it off and only organizers see it. Can be changed at any
                time, including after people have answered.
            </span>
        </span>
    </label>

    {#if kindNeedsOptions(kind)}
        <label class="field-label">
            Options
            <!-- Readonly rather than disabled when locked: a disabled field
                 submits nothing, and the parser wants a valid list on every row. -->
            <textarea
                name="options"
                rows="4"
                readonly={locked}
                value={question.options.join('\n')}
                placeholder={optionsPlaceholder}
                class="field field-area"
            ></textarea>
            <span class="text-meta text-ink-3">One option per line, at least two.</span>
        </label>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
        <button type="submit" class="btn btn-sm btn-solid">{submitLabel}</button>
        {#if locked}
            <span class="text-xs text-ink-3">
                {question.answerCount}
                {question.answerCount === 1 ? 'person has' : 'people have'} answered this, so
                its type, its options and whether it is required are now fixed.
            </span>
        {/if}
    </div>
</form>
