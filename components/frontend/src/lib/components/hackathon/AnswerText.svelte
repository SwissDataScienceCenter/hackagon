<script lang="ts">
    import { linkify } from '$lib/utils/linkify';

    /** One answer as the backend sent it: a tick-box is a bool, the rest text. */
    let { value }: { value: string | boolean } = $props();

    const segments = $derived(typeof value === 'string' ? linkify(value) : []);
</script>

<!--
  Every place an answer's value is printed goes through here, so there is one
  answer to "what does an answer look like on a page" rather than one per view.

  The link colour and underline match `.markdown-body a` in the theme, because a
  link is a link wherever a reader meets one. The `target`/`rel` pair is the same
  policy the markdown sanitizer applies in its `afterSanitizeAttributes` hook —
  restated here rather than shared, since this path deliberately never builds an
  HTML string for DOMPurify to clean. Nothing below is `{@html}`: Svelte escapes
  the text segments, and the only strings that reach an `href` are ones that
  matched an http(s) pattern.

  The markup is packed tight on purpose. Whitespace between these tags would be
  rendered, putting a space in the middle of somebody's sentence wherever a link
  starts or ends.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -- an answer's address is
     always off-site; resolve() is for this app's own routes. Disabled over the
     whole template because the anchor cannot carry a line of its own: a comment
     between these tags is fine, but the newline before it is not. -->
{#if typeof value === 'boolean'}{value
        ? 'Yes'
        : 'No'}{:else}{#each segments as segment, i (i)}{#if segment.kind === 'link'}<a
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-accent-ink underline underline-offset-[0.15em]"
                >{segment.href}</a
            >{:else}{segment.value}{/if}{/each}{/if}
<!-- eslint-enable svelte/no-navigation-without-resolve -->
