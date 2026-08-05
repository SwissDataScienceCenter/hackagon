<script lang="ts">
    import { Pencil, Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <h2 class="m-0 text-title text-ink">Manage Tracks</h2>
            <span class="text-xs text-ink-3">
                {data.tracks.length === 1 ? '1 track' : `${data.tracks.length} tracks`}
            </span>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/tracks/new`)}
            class="btn btn-sm btn-solid no-underline"
        >
            <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
            New track
        </a>
    </div>

    <p class="m-0 text-xs text-ink-3">
        Tracks are optional. When a hackathon has none, participants propose and browse
        projects with no track picker at all.
    </p>

    {#if data.tracks.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            No tracks yet. Add one to let participants sort their projects into it.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.tracks as track (track.id)}
                <li class="card card-raised box-border w-full px-5 py-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-sm leading-snug text-ink">
                                {track.name}
                            </h3>
                            <a
                                href={resolve(
                                    `/my/hackathon/${data.hackathonId}/tracks/${track.id}/edit`
                                )}
                                class="ml-auto text-xs font-semibold text-accent-ink
                                       no-underline hover:underline"
                            >
                                <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                Edit<span class="sr-only"> {track.name}</span>
                            </a>
                        </div>
                        {#if track.description}
                            <p class="m-0 line-clamp-2 text-xs leading-snug text-ink-2">
                                {track.description}
                            </p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
