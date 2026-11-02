<script lang="ts">
    import { isHttpUrl } from '$lib/utils/url';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';

    // Plain strings, not the generated `Submission`: that type lives behind
    // $lib/server and must never be imported into a component.
    let {
        repositoryUrl,
        attachmentFolderUrl,
        description,
    }: {
        repositoryUrl?: string;
        attachmentFolderUrl?: string;
        /** Markdown, as the team typed it. */
        description?: string;
    } = $props();
</script>

<!--
  What a team filed on one submission version. No wrapper element: each line
  sits directly in the caller's flex column, so the caller's gap spaces them.
  Shared by every page that shows a submission, so they all make the same call
  about which links to linkify.
-->

{#snippet linkLine(label: string, value: string)}
    <p class="m-0 text-xs leading-snug">
        <span class="text-ink-3">{label}:</span>
        {#if isHttpUrl(value)}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
            <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-accent-ink hover:underline"
            >
                {value}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {:else}
            <!-- Notes typed into the link field before it had to be one. -->
            <span class="break-words text-ink-2">{value}</span>
        {/if}
    </p>
{/snippet}

{#if repositoryUrl}
    {@render linkLine('Repository', repositoryUrl)}
{/if}
{#if attachmentFolderUrl}
    {@render linkLine('Attachments', attachmentFolderUrl)}
{/if}
{#if description}
    <div class="min-w-0 text-xs leading-snug text-ink-2">
        <MarkdownContent content={description} />
    </div>
{/if}
{#if !repositoryUrl && !attachmentFolderUrl && !description}
    <!-- Said outright: every field is optional on the backend, and a blank
         version would otherwise be indistinguishable from a broken render. -->
    <p class="m-0 text-xs leading-snug text-ink-3 italic">Nothing filled in on this version.</p>
{/if}
