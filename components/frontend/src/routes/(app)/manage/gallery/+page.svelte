<script lang="ts">
    import { resolve } from '$app/paths';
    import { invalidateAll } from '$app/navigation';
    import ImagePickerDialog from '$lib/components/forms/ImagePickerDialog.svelte';
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import DataTable from '$lib/components/data/DataTable.svelte';
    import { formatBytes, originOfKey } from '$lib/gallery';
    import { matchesQuery, type Column, type ViewMode } from '$lib/utils/dataView';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Uploads from this page file under `site/media/` — the platform's own
    // prefix. See ./media/+server.ts for why it cannot be an event's.
    const UPLOAD_ENDPOINT = '/manage/gallery/media';

    let uploading = $state(false);
    let search = $state('');
    let view = $state<ViewMode>('cards');
    let filterValues = $state<Record<string, string>>({ origin: '' });

    /** One row's derived display facts, computed once rather than per-cell. */
    const rows = $derived(
        data.images.map((image) => {
            const origin = originOfKey(image.key);
            const eventName = origin.hackathonId
                ? (data.eventNames[origin.hackathonId] ?? origin.hackathonId)
                : undefined;

            return {
                ...image,
                label: origin.label,
                hackathonId: origin.hackathonId,
                eventName,
                // The searchable text: what it is, which event, and the key —
                // so pasting a path out of a page's markdown finds the picture.
                haystack: [origin.label, eventName ?? '', image.key].join(' '),
                // The filter bucket. Coarse on purpose: "is this a platform
                // picture or an event's" is the question this page gets asked.
                bucket: image.key.startsWith('site/') ? 'site' : 'event',
            };
        })
    );

    const FILTERS = [
        {
            id: 'origin',
            label: 'Where from',
            options: [
                { value: 'event', label: 'Events' },
                { value: 'site', label: 'Platform pages' },
            ],
        },
    ];

    const visible = $derived(
        rows.filter(
            (r) =>
                matchesQuery(search, r.haystack) &&
                (filterValues.origin === '' || filterValues.origin === r.bucket)
        )
    );

    type Row = (typeof visible)[number];

    // The table view is not decoration: an admin's real questions about a media
    // library are "which of these is 4 MB" and "what path do I paste", and both
    // are answers a sortable column gives and a grid of thumbnails does not.
    const COLUMNS: Column<Row>[] = [
        { key: 'preview', label: '' },
        { key: 'label', label: 'Kind', sort: (r) => r.label },
        { key: 'event', label: 'Event', sort: (r) => r.eventName ?? '' },
        { key: 'size', label: 'Size', sort: (r) => r.sizeBytes, align: 'right' },
        { key: 'date', label: 'Uploaded', sort: (r) => r.lastModified ?? '' },
        { key: 'path', label: 'Path' },
    ];

    /** Copy a stored path, so it can be pasted into a markdown page by hand. */
    let copied = $state<string | null>(null);
    async function copy(url: string) {
        try {
            await navigator.clipboard.writeText(url);
            copied = url;
            setTimeout(() => {
                if (copied === url) copied = null;
            }, 2000);
        } catch {
            // A clipboard permission refusal is not worth an error banner: the
            // path is visible in the tile and selectable by hand.
            copied = null;
        }
    }
</script>

<svelte:head>
    <title>Media library · Hackagon</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl p-4 sm:p-6">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Media library</h1>
            <p class="m-0 text-sm text-ink-3">
                Every picture uploaded into an event or a platform page. Newest first.
            </p>
        </div>
        <button class="btn btn-sm btn-accent" onclick={() => (uploading = true)}>
            Upload images
        </button>
    </div>

    <!--
      Said out loud rather than left to be inferred. "All pictures" here means
      every picture the platform PUBLISHES: profile pictures and submission
      attachments are not listable by anyone, because one is other people's
      faces and the other is private by bucket policy. A gallery that quietly
      omitted them would read as a complete inventory and is not one.
    -->
    <p class="mb-4 text-meta text-ink-3">
        Profile pictures and team submission files are deliberately not listed here.
        There is also no delete: an image can be referenced from any page's markdown,
        any event's logo or any prize row, and nothing records which — so removing one
        would break those references silently. Deleting an event or an account still
        takes its files with it.
    </p>

    {#if data.images.length === 0}
        <p class="py-6 text-ink-3">
            Nothing has been uploaded yet. Add a picture from an event's page editor, or
            use Upload images above.
        </p>
    {:else}
        <div class="mb-4">
            <DataToolbar
                bind:search
                bind:view
                bind:filterValues
                viewKey="manage-gallery"
                filters={FILTERS}
                placeholder="Search by event, kind or path…"
                summary="{data.images.length} image{data.images.length === 1 ? '' : 's'}"
                shown={visible.length}
                total={data.images.length}
            />
        </div>
    {/if}

    {#if data.images.length > 0 && visible.length === 0}
        <p class="py-6 text-center text-sm text-ink-3">No images match your search.</p>
    {/if}

    {#if visible.length > 0 && view === 'table'}
        <DataTable
            columns={COLUMNS}
            rows={visible}
            rowKey={(r) => r.key}
            caption="Uploaded images"
        >
            {#snippet row(image)}
                <td class="px-3 py-2">
                    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- /objects is a stored path served by the object-store proxy, not a route -->
                    <a href={image.url} target="_blank" rel="noopener" data-sveltekit-reload>
                        <img
                            src={image.url}
                            alt={image.eventName
                                ? `${image.label} for ${image.eventName}`
                                : image.label}
                            loading="lazy"
                            class="h-10 w-14 rounded-field bg-raised object-contain"
                        />
                    </a>
                </td>
                <td class="px-3 py-2 font-medium" data-testid="image-origin">
                    {image.label}
                </td>
                <td class="px-3 py-2" data-testid="image-event">
                    {image.eventName ?? '—'}
                </td>
                <td class="px-3 py-2 text-right tabular-nums">
                    {formatBytes(image.sizeBytes)}
                </td>
                <td class="px-3 py-2">
                    {image.lastModified
                        ? new Date(image.lastModified).toLocaleDateString()
                        : '—'}
                </td>
                <td class="px-3 py-2">
                    <button
                        type="button"
                        class="btn btn-sm btn-quiet"
                        onclick={() => void copy(image.url)}
                    >
                        {copied === image.url ? 'Copied' : 'Copy path'}
                    </button>
                </td>
            {/snippet}
        </DataTable>
    {:else if visible.length > 0}
        <ul class="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {#each visible as image (image.key)}
                <li class="card flex flex-col gap-2 p-2">
                    <!-- The picture links to itself, so "show me the full size"
                         is one click and needs no viewer of our own. `/objects`
                         is a stored path served by the object-store proxy, not
                         a SvelteKit route, so the router must stay out of it. -->
                    <!-- eslint-disable svelte/no-navigation-without-resolve -- see above -->
                    <a
                        href={image.url}
                        target="_blank"
                        rel="noopener"
                        class="block"
                        data-sveltekit-reload
                    >
                        <img
                            src={image.url}
                            alt={image.eventName
                                ? `${image.label} for ${image.eventName}`
                                : image.label}
                            loading="lazy"
                            class="h-32 w-full rounded-field bg-raised object-contain"
                        />
                    </a>
                    <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    <div class="flex flex-col gap-1">
                        <!-- The element that STATES the fact. A test asserting
                             "this tile is an event logo" must read this line and
                             not the card, which also contains the word in its
                             alt text and its link. -->
                        <p class="m-0 text-sm font-medium" data-testid="image-origin">
                            {image.label}
                        </p>
                        {#if image.eventName}
                            <p class="m-0 text-meta text-ink-3" data-testid="image-event">
                                {image.eventName}
                            </p>
                        {/if}
                        <p class="m-0 text-meta text-ink-3">
                            {formatBytes(image.sizeBytes)}{image.lastModified
                                ? ` · ${new Date(image.lastModified).toLocaleDateString()}`
                                : ''}
                        </p>
                        <button
                            type="button"
                            class="btn btn-sm btn-quiet self-start"
                            onclick={() => void copy(image.url)}
                        >
                            {copied === image.url ? 'Copied' : 'Copy path'}
                        </button>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}

    <div class="mt-6 flex flex-wrap items-center gap-3">
        {#if data.nextPageToken}
            <!-- A link, not a fetch: the second page is a real URL that survives
                 a reload and works with JavaScript off. -->
            <a
                class="btn btn-sm"
                href="{resolve('/(app)/manage/gallery')}?page={data.nextPageToken}"
            >
                Older images
            </a>
        {/if}
        {#if data.pageToken}
            <a class="btn btn-sm btn-quiet" href={resolve('/(app)/manage/gallery')}>
                Back to newest
            </a>
        {/if}
        {#if data.truncated}
            <p class="m-0 text-meta text-ink-3">
                The store holds more than one listing can scan; the most recent uploads
                are shown.
            </p>
        {/if}
    </div>

    <!-- Upload-only: this page IS the gallery, so a "choose from gallery" tab
         would offer what is already on screen. -->
    <ImagePickerDialog
        bind:open={uploading}
        uploadEndpoint={UPLOAD_ENDPOINT}
        title="Upload images"
        fileLabel="Choose image files to add to the library"
        maxMb={15}
        multiple
        onpick={() => {
            // Re-run the load so the new picture appears in the grid. The dialog
            // closes itself; this is what makes the page agree with the store.
            void invalidateAll();
        }}
    />
</div>
