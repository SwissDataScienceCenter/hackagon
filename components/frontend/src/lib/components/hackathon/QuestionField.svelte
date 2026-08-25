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
        <span class="text-sm text-ink">
            {question.label}
            {#if question.mandatory}
                <span class="text-danger-ink" aria-hidden="true">*</span>
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
    </label>
{:else}
    <label class="field-label">
        {question.label}
        {#if question.mandatory}
            <span class="text-danger-ink" aria-hidden="true">*</span>
        {/if}
        <input type="text" {name} {required} value={text} readonly={readonly} class="field" />
    </label>
{/if}
