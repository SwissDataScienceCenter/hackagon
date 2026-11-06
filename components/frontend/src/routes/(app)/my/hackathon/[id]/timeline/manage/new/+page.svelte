<script lang="ts">
    import { resolve } from '$app/paths';
    import PhaseForm from '$lib/components/hackathon/PhaseForm.svelte';
    import InfoButton from '$lib/components/layout/InfoButton.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PhaseForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/timeline/manage`);

    const blank = {
        name: '',
        description: '',
        startsAt: undefined,
        endsAt: undefined,
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to Manage Timeline
        </a>
        <div class="flex items-center gap-2">
            <h1 class="m-0 text-title text-ink">Add Phase</h1>
            <InfoButton topic="phase-new" title="A new phase" />
        </div>
    </div>

    <PhaseForm
        phase={blank}
        cancelHref={backHref}
        submitLabel="Add phase"
        message={form?.message}
        datesEditable={false}
    />
</div>
