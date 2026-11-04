<script lang="ts">
    import PageForm from '$lib/components/hackathon/PageForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PageForm` and `PageHeader` call `resolve()` at their own
    // anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/pages`);

    // Two-step rather than `confirm()`: a native dialog is unstyleable, invisible
    // to the tests, and blocks the thread. Mirrors the same pattern on the
    // timeline's phase delete.
    let confirming = $state(false);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="Edit Page" back={{ href: backHref, label: 'Manage Pages' }}>
        {#snippet meta()}Changes are visible to participants immediately.{/snippet}
    </PageHeader>

    <PageForm page={data.page} cancelHref={backHref} submitLabel="Save changes" message={form?.message} />

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
