<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';

    let {
        category,
        cancelHref,
        submitLabel,
        message
    }: {
        category: {
            name: string;
            description: string;
            /** 'single_choice' | 'points' — the two methods this form offers. */
            votingMethod: string;
            /** Only meaningful for 'points'; 0 when unset. */
            maxPoints: number;
        };
        /** Unresolved path — `resolve()` is called here, at the anchor. */
        cancelHref: string;
        submitLabel: string;
        /** Failure text from the action, if the last submit failed. */
        message?: string;
    } = $props();

    // Local so the points budget can appear and disappear with the choice. The
    // server re-reads the submitted value either way and ignores the budget for
    // single choice, so this is presentation only.
    //
    // No "changing the method deletes the votes" warning: the backend does do
    // that, but this form is only ever shown for a category nobody has voted in
    // — see `categoryVoterCount`.
    let method = $state(category.votingMethod || 'single_choice');
</script>

<!-- Server-side validation only: every rule here is one the action repeats, and
     the action is what the backend actually sees.

     The `?/save` action name is part of this component's contract — any page
     using it must expose an action by that name. -->
<form method="POST" action="?/save" class="flex w-full flex-col gap-6">
    {#if message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{message}</p>
    {/if}

    <label class="field-label">
        Name
        <input
            type="text"
            name="name"
            required
            minlength="3"
            maxlength="255"
            value={category.name}
            placeholder="Best Demo"
            class="field"
        />
    </label>

    <fieldset class="field-label m-0 border-0 p-0">
        <legend class="mb-2">How people vote</legend>

        <div class="flex flex-col gap-2">
            <label class="flex items-start gap-2 text-sm font-normal text-ink">
                <input
                    type="radio"
                    name="votingMethod"
                    value="single_choice"
                    bind:group={method}
                    class="mt-1 shrink-0"
                />
                <span class="flex flex-col gap-0.5">
                    <span>Single choice</span>
                    <span class="text-xs text-ink-3">
                        Each voter picks one submission. Simplest to run and to read.
                    </span>
                </span>
            </label>

            <label class="flex items-start gap-2 text-sm font-normal text-ink">
                <input
                    type="radio"
                    name="votingMethod"
                    value="points"
                    bind:group={method}
                    class="mt-1 shrink-0"
                />
                <span class="flex flex-col gap-0.5">
                    <span>Points</span>
                    <span class="text-xs text-ink-3">
                        Each voter spreads a fixed budget across as many submissions as
                        they like.
                    </span>
                </span>
            </label>
        </div>

        <!--
          Ranked voting is the third method the backend supports and is
          deliberately not offered yet: it needs a drag-to-order control, and
          every method here has to be castable in the booth before it is worth
          creating. A category created as ranked through the API still lists and
          still tallies; it just cannot be voted on from this UI.
        -->
    </fieldset>

    {#if method === 'points'}
        <label class="field-label">
            Points per voter
            <input
                type="number"
                name="maxPoints"
                min="1"
                max="1000"
                required
                value={category.maxPoints > 0 ? category.maxPoints : 10}
                class="field w-32"
            />
            <span class="text-xs font-normal text-ink-3">
                The total each voter may hand out across all submissions.
            </span>
        </label>
    {/if}

    <!-- Last and full width: the only field with no natural size, and the one
         where the room is worth having for the source and its preview both. -->
    <div class="field-label w-full">
        <label for="vote-category-description">Description</label>
        <MarkdownEditor
            id="vote-category-description"
            name="description"
            value={category.description}
            rows={8}
            placeholder="What should people be judging? Name the criteria."
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
