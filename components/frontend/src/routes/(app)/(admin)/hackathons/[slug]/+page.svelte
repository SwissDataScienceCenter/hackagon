<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import {
        statusLabel,
        statusBadgePreset,
        visibilityLabel,
        visibilityBadgePreset,
    } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const hackathon = $derived(data.hackathon);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve('/(app)/(admin)/hackathons')}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to all hackathons
        </a>
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="m-0 text-lg font-bold text-surface-950-50">{hackathon.name}</h1>
            {#if statusLabel(hackathon.status)}
                <span class="badge {statusBadgePreset(hackathon.status)}">
                    {statusLabel(hackathon.status)}
                </span>
            {/if}
            {#if visibilityLabel(hackathon.visibility)}
                <span class="badge {visibilityBadgePreset(hackathon.visibility)}">
                    {visibilityLabel(hackathon.visibility)}
                </span>
            {/if}
        </div>
    </div>

    <div class="flex gap-2">
        <a href={resolve(`/hackathons/${hackathon.id}/edit`)} class="btn btn-sm preset-filled-primary-500">
            Edit
        </a>
        <button
            type="button"
            disabled
            class="btn btn-sm preset-tonal-surface cursor-not-allowed opacity-50"
            title="Not available yet"
        >
            Delete
        </button>
    </div>

    <div class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-5 text-sm">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
                <p class="m-0 text-xs font-semibold text-surface-500">Starts at</p>
                <p class="m-0">{hackathon.startsAt ? new Date(hackathon.startsAt).toLocaleString() : '—'}</p>
            </div>
            <div>
                <p class="m-0 text-xs font-semibold text-surface-500">Ends at</p>
                <p class="m-0">{hackathon.endsAt ? new Date(hackathon.endsAt).toLocaleString() : '—'}</p>
            </div>
            <div>
                <p class="m-0 text-xs font-semibold text-surface-500">Creator</p>
                <p class="m-0">{hackathon.creator?.displayName || hackathon.creator?.username || '—'}</p>
            </div>
            <div>
                <p class="m-0 text-xs font-semibold text-surface-500">Last modified by</p>
                <p class="m-0">{hackathon.modifier?.displayName || hackathon.modifier?.username || '—'}</p>
            </div>
        </div>

        {#if hackathon.logo}
            <div>
                <p class="m-0 text-xs font-semibold text-surface-500">Logo</p>
                <img src={hackathon.logo} alt="" class="mt-1 h-16 w-16 object-cover" />
            </div>
        {/if}

        <div>
            <p class="m-0 pb-1 text-xs font-semibold text-surface-500">Description</p>
            {#if hackathon.description}
                <MarkdownContent content={hackathon.description} />
            {:else}
                <p class="m-0 text-surface-500">No description.</p>
            {/if}
        </div>
    </div>
</div>
