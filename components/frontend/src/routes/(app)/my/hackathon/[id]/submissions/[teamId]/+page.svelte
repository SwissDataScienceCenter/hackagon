<script lang="ts">
    import { resolve } from '$app/paths';
    import SubmissionDetail from '$lib/components/hackathon/SubmissionDetail.svelte';
    import BackLink from '$lib/components/layout/BackLink.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

{#snippet edit()}
    <!-- Straight to the open form on Our submission rather than a form here:
         one place edits, the one with the unsaved-changes guard. -->
    <a
        href="{resolve(
            `/my/hackathon/${data.hackathonId}/submissions/mine`
        )}?edit={data.teamId}"
        class="btn btn-sm btn-outline-accent no-underline"
    >
        {data.entry ? 'Edit' : 'Make your first submission'}
    </a>
{/snippet}

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects).

  Laid out like the team's page; the back link returns to the page the reader
  came from, and to Submissions when there is none to know of (see BackLink).
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <BackLink
        fallbackHref={resolve(`/my/hackathon/${data.hackathonId}/submissions`)}
        fallbackLabel="Back to submissions"
    />

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
