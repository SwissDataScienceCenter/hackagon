<script lang="ts">
    import { resolve } from '$app/paths';
    import PhaseForm from '$lib/components/hackathon/PhaseForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PhaseForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/timeline`);

    const blank = {
        name: '',
        description: '',
        startsAt: undefined,
        endsAt: undefined,
        pageId: '',
        capabilities: [] as number[],
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/timeline`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to timeline
        </a>
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Add Phase</h1>
        <p class="m-0 text-xs text-surface-500">
            Participants see the phase as soon as it is saved. Undated phases sort to the
            top of the timeline until they are scheduled.
        </p>
    </div>

    <PhaseForm
        phase={blank}
        pages={data.pages}
        cancelHref={backHref}
        submitLabel="Add phase"
        message={form?.message}
        datesEditable={false}
    />
</div>
