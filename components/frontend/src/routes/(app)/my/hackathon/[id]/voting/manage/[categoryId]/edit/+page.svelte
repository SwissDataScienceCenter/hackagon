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
        maxPoints: data.category.maxPoints,
        isJury: data.category.isJury
    });
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/voting/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to voting
        </a>
        <h1 class="m-0 text-title text-ink">Edit Voting Category</h1>
        <p class="m-0 text-xs text-ink-3">
            {data.voteCount === 0
                ? 'No votes cast yet.'
                : data.voteCount === 1
                  ? '1 vote cast so far.'
                  : `${data.voteCount} votes cast so far.`}
        </p>
    </div>

    <VoteCategoryForm
        category={initial}
        cancelHref={backHref}
        submitLabel="Save changes"
        message={form?.message}
        voteCount={data.voteCount}
    />
</div>
