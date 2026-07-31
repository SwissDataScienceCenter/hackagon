<script lang="ts">
    import { Segment } from '@skeletonlabs/skeleton-svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';

    let {
        title = '',
        visible = false,
        content = ''
    }: { title?: string; visible?: boolean; content?: string } = $props();
</script>

<label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
    Title
    <input
        type="text"
        name="title"
        required
        minlength="1"
        maxlength="255"
        value={title}
        class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
               text-surface-950-50 focus:border-primary-500 focus:outline-none"
    />
</label>
<div class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
    Visibility
    <Segment name="visible" defaultValue={visible ? 'visible' : 'hidden'}>
        <Segment.Item value="visible">Visible</Segment.Item>
        <Segment.Item value="hidden">Hidden</Segment.Item>
    </Segment>
</div>
<label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
    Content
    <MarkdownEditor name="content" value={content} maxlength={10000} rows={10} />
</label>
