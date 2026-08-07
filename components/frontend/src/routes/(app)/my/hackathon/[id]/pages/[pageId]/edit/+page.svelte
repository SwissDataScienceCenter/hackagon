<script lang="ts">
    import { resolve } from '$app/paths';
    import PageForm from '$lib/components/hackathon/PageForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PageForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/pages`);

    // Two-step rather than `confirm()`: a native dialog is unstyleable, invisible
    // to the tests, and blocks the thread. Mirrors the same pattern on the
    // timeline's phase delete.
    let confirming = $state(false);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/pages`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to pages
        </a>
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Edit Page</h1>
        <p class="m-0 text-xs text-surface-500">
            Changes are visible to participants immediately.
        </p>
    </div>

    <PageForm uploadEndpoint={`/my/hackathon/${data.hackathonId}/media`} page={data.page} cancelHref={backHref} submitLabel="Save changes" message={form?.message} />

    <div class="flex flex-col gap-2 border-t border-surface-200-800 pt-6">
        <h2 class="m-0 text-xs font-semibold text-surface-500">Delete this page</h2>
        {#if confirming}
            <p class="m-0 text-xs text-surface-600-400">
                Deleting <strong class="text-surface-950-50">{data.page.title}</strong> cannot
                be undone. Any phase linked to it stays, only the page goes.
            </p>
            <form method="POST" action="?/delete" class="flex gap-2">
                <button type="submit" class="btn btn-sm preset-filled-error-500">
                    Delete permanently
                </button>
                <button
                    type="button"
                    onclick={() => (confirming = false)}
                    class="btn btn-sm preset-tonal-surface"
                >
                    Keep it
                </button>
            </form>
        {:else}
            <p class="m-0 text-xs text-surface-600-400">
                Removes the page from the sidebar for everyone.
            </p>
            <button
                type="button"
                onclick={() => (confirming = true)}
                class="btn btn-sm w-fit preset-outlined-error-500"
            >
                Delete page
            </button>
        {/if}
    </div>
</div>
