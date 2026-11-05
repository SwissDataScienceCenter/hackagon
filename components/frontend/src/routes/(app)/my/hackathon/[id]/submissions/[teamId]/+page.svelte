<script lang="ts">
    import { resolve } from '$app/paths';
    import SubmissionDetail from '$lib/components/hackathon/SubmissionDetail.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

{#snippet edit()}
    <!-- To the form rather than a form here: one place edits, the one with the
         unsaved-changes guard. -->
    <a
        href={resolve(`/my/hackathon/${data.hackathonId}/submissions/mine`)}
        class="btn btn-sm btn-outline-accent no-underline"
    >
        Edit
    </a>
{/snippet}

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects).

  Laid out like the team's page; the back link goes to whichever page sent the
  reader here — resolved in the load, Submissions when it cannot tell.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
    <a href={resolve(data.backHref as any)} class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline">
        &larr; {data.backLabel}
    </a>

    <SubmissionDetail
        projectTitle={data.projectTitle}
        teamName={data.teamName}
        entry={data.entry}
        team={{
            href: `/my/hackathon/${data.hackathonId}/teams/${data.teamId}`,
            imageUrl: data.imageUrl,
            members: data.members.map((m) => ({
                name: m.name,
                href: resolve(`/my/hackathon/${data.hackathonId}/participants/${m.id}`),
            })),
        }}
        project={data.project
            ? {
                  ...data.project,
                  href: `/my/hackathon/${data.hackathonId}/projects/${data.project.id}`,
              }
            : undefined}
        actions={data.mayEdit ? edit : undefined}
    />
</div>
