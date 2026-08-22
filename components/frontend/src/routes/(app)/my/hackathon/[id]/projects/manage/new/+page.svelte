<script lang="ts">
    import { resolve } from '$app/paths';
    import ProjectEditForm from '$lib/components/hackathon/ProjectEditForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `ProjectEditForm` calls `resolve()` at its own anchor, and the
    // back link below resolves a literal inline — extracting a resolved string
    // would widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/projects/manage`);
</script>

<!--
  The organiser's create form. The same form the edit route uses, on an empty
  project — so the two cannot drift apart, and an organiser filling this in sees
  the fields they will later edit.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the manage list).
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to Manage Projects
        </a>
        <h1 class="m-0 text-title text-ink">New Project</h1>
        <p class="m-0 text-xs text-ink-3">
            It joins the queue awaiting review, like any proposal — approve it there and it
            appears on the participants' Projects page.
        </p>
    </div>

    <ProjectEditForm
        project={{ title: '', description: '', trackId: '', image: '' }}
        tracks={data.tracks}
        cancelHref={backHref}
        message={form?.message}
        submitLabel="Create project"
    />
</div>
