<script lang="ts">
    import { resolve } from '$app/paths';
    import VoteCategoryForm from '$lib/components/hackathon/VoteCategoryForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `VoteCategoryForm` calls `resolve()` at its own anchor, and the
    // back link below resolves a literal inline — extracting a resolved string
    // would widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/voting/manage`);

    const blank = {
        name: '',
        description: '',
        votingMethod: 'single_choice',
        maxPoints: 0
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/voting/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to voting
        </a>
        <h1 class="m-0 text-title text-ink">New Voting Category</h1>
        <p class="m-0 text-xs text-ink-3">
            Participants vote on submissions, one vote per category.
        </p>
    </div>

    <VoteCategoryForm
        category={blank}
        cancelHref={backHref}
        submitLabel="Create category"
        message={form?.message}
    />
</div>
