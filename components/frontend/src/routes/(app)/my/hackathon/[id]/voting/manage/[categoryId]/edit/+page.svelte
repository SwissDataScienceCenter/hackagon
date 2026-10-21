<script lang="ts">
    import { resolve } from '$app/paths';
    import VoteCategoryForm from '$lib/components/hackathon/VoteCategoryForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `VoteCategoryForm` calls `resolve()` at its own anchor, and the
    // back link below resolves a literal inline — extracting a resolved string
    // would widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/voting/manage`);

    const initial = $derived({
        name: data.category.name,
        description: data.category.description,
        votingMethod: data.category.method,
        maxPoints: data.category.maxPoints
    });
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/voting/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Manage Voting
        </a>
        <h1 class="m-0 text-title text-ink">Edit Voting Category</h1>
    </div>

    {#if data.resultsFinal && data.voters === 0}
        <p class="m-0 text-sm text-ink-2">
            <strong>{data.category.name}</strong> can no longer be changed: the results of
            this voting round are final.
        </p>
    {:else if data.voters > 0}
        <!-- Locked rather than editable with a warning: what people voted on has
             to stay what it was. Reached only by a direct link — the list
             offers no Edit for a category anyone has voted in. -->
        <p class="m-0 text-sm text-ink-2">
            <strong>{data.category.name}</strong> can no longer be changed:
            {data.voters === 1 ? '1 person has' : `${data.voters} people have`} voted in
            it, and what they voted on has to stay as it was.
        </p>
    {:else}
        <VoteCategoryForm
            category={initial}
            cancelHref={backHref}
            submitLabel="Save changes"
            message={form?.message}
        />
    {/if}
</div>
