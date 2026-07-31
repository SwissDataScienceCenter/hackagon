<script lang="ts">
    import { resolve } from '$app/paths';
    import { submissionStatusLabel, submissionStatusBadgePreset } from '$lib/utils/submissionStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const groups = $derived(data.groups);

    let showHistory: Record<string, boolean> = $state({});

    function formatDate(d: Date | undefined): string {
        if (!d) return '—';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // `result` is free text with no backend validation, so only linkify what is
    // unambiguously a web address — never hand an arbitrary string to href.
    function isWebUrl(s: string): boolean {
        return s.startsWith('http://') || s.startsWith('https://');
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <h2 class="m-0 text-lg font-bold text-surface-950-50">Submissions</h2>

    {#if groups.length === 0}
        <p class="m-0 text-sm text-surface-500">
            You're not on a team yet — once you're assigned to a team you can submit here. See the
            <a
                href={resolve(`/hackathon/${data.slug}/teams`)}
                class="text-primary-700-300 no-underline hover:underline"
            >
                Teams
            </a>
            page.
        </p>
    {:else}
        {#each groups as g (g.teamId)}
            <section class="card preset-outlined-surface-200-800 flex w-full flex-col gap-4 p-5">
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <a
                        href={resolve(`/hackathon/${data.slug}/teams/${g.teamId}`)}
                        class="text-sm font-bold text-primary-700-300 no-underline hover:underline"
                    >
                        {g.teamName}
                    </a>
                    <span class="text-xs text-surface-500">{g.projectTitle}</span>
                </div>

                {#if !g.latest}
                    <p class="m-0 text-xs text-surface-500">No submission yet.</p>
                {:else}
                    <div class="flex flex-col gap-2 border border-surface-200-800 bg-surface-100-900 p-4">
                        <div class="flex flex-wrap items-center gap-2">
                            <span
                                class="badge {submissionStatusBadgePreset(g.latest.status) ??
                                    'preset-tonal-surface'}"
                            >
                                {submissionStatusLabel(g.latest.status) ?? 'Unknown'}
                            </span>
                            <span class="text-xs font-semibold text-surface-950-50">
                                Version {g.latest.version}
                            </span>
                            <span class="text-xs text-surface-500">
                                updated {formatDate(g.latest.modifiedAt)}
                            </span>
                        </div>

                        {#if g.latest.result}
                            {#if isWebUrl(g.latest.result)}
                                <!-- eslint-disable svelte/no-navigation-without-resolve -- the
                                     submission result is a team-supplied external URL, guarded by
                                     isWebUrl above; resolve() is for internal routes only. -->
                                <a
                                    href={g.latest.result}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="m-0 break-all text-xs leading-relaxed text-primary-700-300
                                           no-underline hover:underline"
                                >
                                    {g.latest.result}
                                </a>
                                <!-- eslint-enable svelte/no-navigation-without-resolve -->
                            {:else}
                                <p class="m-0 break-all text-xs leading-relaxed text-surface-600-400">
                                    {g.latest.result}
                                </p>
                            {/if}
                        {:else}
                            <p class="m-0 text-xs italic text-surface-500">No result recorded.</p>
                        {/if}
                    </div>
                {/if}

                {#if g.earlier.length > 0}
                    <div class="flex flex-col gap-2">
                        <button
                            type="button"
                            onclick={() => (showHistory[g.teamId] = !showHistory[g.teamId])}
                            class="w-fit text-xs font-semibold text-surface-500 hover:text-surface-700-300"
                        >
                            {showHistory[g.teamId] ? '▾' : '▸'}
                            Earlier versions ({g.earlier.length})
                        </button>

                        {#if showHistory[g.teamId]}
                            <ul class="m-0 flex flex-col gap-2 p-0">
                                {#each g.earlier as s (s.id)}
                                    <li
                                        class="flex flex-col gap-1 border-t border-surface-200-800 pt-2
                                               first:border-0 first:pt-0"
                                    >
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span
                                                class="badge {submissionStatusBadgePreset(s.status) ??
                                                    'preset-tonal-surface'}"
                                            >
                                                {submissionStatusLabel(s.status) ?? 'Unknown'}
                                            </span>
                                            <span class="text-xs text-surface-500">
                                                v{s.version} · {formatDate(s.createdAt)}
                                            </span>
                                        </div>
                                        {#if s.result}
                                            <p class="m-0 break-all text-xs text-surface-600-400">
                                                {s.result}
                                            </p>
                                        {:else}
                                            <p class="m-0 text-xs italic text-surface-500">
                                                No result recorded.
                                            </p>
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                {/if}
            </section>
        {/each}
    {/if}
</div>
