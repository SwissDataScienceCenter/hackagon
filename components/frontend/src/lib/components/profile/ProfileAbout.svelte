<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';

    let {
        description,
        emptyText = 'Nothing here yet.',
    }: {
        /**
         * TODO(backend: user-profile-fields): from $lib/mocks/userProfiles. Skills
         * live in this prose by design — there is no structured skills field.
         */
        description?: string;
        /** Wording differs between your own profile and someone else's. */
        emptyText?: string;
    } = $props();

    const hasContent = $derived((description ?? '').trim().length > 0);
</script>

<section
    class="box-border flex w-full flex-col gap-2 border border-surface-200-800
           bg-surface-100-900 px-5 py-4"
>
    <h2 class="m-0 text-sm font-bold leading-snug text-surface-950-50">About</h2>
    {#if hasContent}
        <!-- MarkdownContent sanitizes via DOMPurify, so user-authored copy is
             safe to render here once this stops being mock data. -->
        <div class="text-xs text-surface-600-400">
            <MarkdownContent content={description ?? ''} />
        </div>
    {:else}
        <p class="m-0 text-xs leading-snug text-surface-500">{emptyText}</p>
    {/if}
</section>
