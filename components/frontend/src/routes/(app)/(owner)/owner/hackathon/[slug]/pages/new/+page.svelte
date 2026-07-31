<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import PageFormFields from '$lib/components/forms/PageFormFields.svelte';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();
    const slug = $derived($page.params.slug);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/owner/hackathon/${slug}/pages`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to Pages
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">New Page</h2>
    </div>

    <form
        method="POST"
        action="?/create"
        class="card preset-outlined-surface-200-800 flex w-full flex-col gap-3 p-5"
    >
        {#if form?.message}
            <p class="m-0 text-xs text-error-500">{form.message}</p>
        {/if}
        <PageFormFields />
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Create Page
        </button>
    </form>
</div>
