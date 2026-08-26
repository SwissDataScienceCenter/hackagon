<script lang="ts">
    import { answerFieldName, type QuestionKind } from '$lib/utils/question';

    let {
        question,
        value,
        readonly = false
    }: {
        question: {
            id: string;
            label: string;
            kind: QuestionKind;
            mandatory: boolean;
            options: string[];
            /** Whether everyone in the hackathon will be able to read the answer. */
            publicAnswers: boolean;
        };
        /** The answer already on file, if any. */
        value?: string | boolean;
        /** Someone else's answers, shown but not editable. */
        readonly?: boolean;
    } = $props();

    const name = $derived(answerFieldName(question.id));
    const text = $derived(typeof value === 'string' ? value : '');
    const ticked = $derived(value === true);

    // `required` on the control, so the browser says which field is missing
    // before a round trip. The backend repeats the check — it refuses a
    // submission that leaves a mandatory question unanswered — so this only
    // decides how quickly the person hears about it.
    const required = $derived(question.mandatory && !readonly);

    // Said at the point of answering, not only afterwards on the profile: this is
    // the moment the person decides what to type, and finding out later that the
    // whole cohort can read it is finding out too late. Suppressed when the field
    // is someone else's answer being displayed — there it is not a warning, it is
    // the reason the answer is on screen at all.
    const shared = $derived(question.publicAnswers && !readonly);
</script>

{#if question.kind === 'bool'}
    <!-- A tick-box carries its label to the right of it, unlike the fields
         below: the label is the statement being agreed to, not a name for a
         box. `required` is what makes a code of conduct binding here. -->
    <label class="flex items-start gap-2">
        <input
            type="checkbox"
            {name}
            {required}
            value="true"
            checked={ticked}
            disabled={readonly}
            class="checkbox mt-0.5 shrink-0"
        />
        <span class="flex flex-col gap-0.5 text-sm text-ink">
            <span>
                {question.label}
                {#if question.mandatory}
                    <span class="text-danger-ink" aria-hidden="true">*</span>
                {/if}
            </span>
            {#if shared}
                <span class="text-meta text-ink-3">
                    Your answer is shown to everyone taking part.
                </span>
            {/if}
        </span>
    </label>
{:else if question.kind === 'enum'}
    <label class="field-label">
        {question.label}
        {#if question.mandatory}
            <span class="text-danger-ink" aria-hidden="true">*</span>
        {/if}
        <select {name} {required} disabled={readonly} class="field">
            <!-- An empty first option so a fresh optional question starts
                 unanswered rather than silently defaulting to whatever happens
                 to be first in the list. -->
            <option value="">{question.mandatory ? 'Choose one…' : '— no answer —'}</option>
            {#each question.options as option (option)}
                <option value={option} selected={option === text}>{option}</option>
            {/each}
        </select>
        {#if shared}
            <span class="text-meta text-ink-3">
                Your answer is shown to everyone taking part.
            </span>
        {/if}
    </label>
{:else}
    <label class="field-label">
        {question.label}
        {#if question.mandatory}
            <span class="text-danger-ink" aria-hidden="true">*</span>
        {/if}
        <input type="text" {name} {required} value={text} readonly={readonly} class="field" />
        {#if shared}
            <span class="text-meta text-ink-3">
                Your answer is shown to everyone taking part.
            </span>
        {/if}
    </label>
{/if}
