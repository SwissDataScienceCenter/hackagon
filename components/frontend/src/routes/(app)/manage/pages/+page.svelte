<script lang="ts">
    import { enhance } from '$app/forms';
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import DataTable from '$lib/components/data/DataTable.svelte';
    import RowActions from '$lib/components/data/RowActions.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import { matchesQuery, type Column, type ViewMode } from '$lib/utils/dataView';

    // Presigns a `site/media/…` upload; the backend requires the global Admin
    // role, the same as every mutation on this page. See ./media/+server.ts.
    const UPLOAD_ENDPOINT = '/manage/pages/media';

    const { data, form } = $props();

    // Which page's editor is expanded. Slugs are unique, so they key the UI.
    let editing = $state<string | null>(null);
    let creating = $state(false);

    function toggleEdit(slug: string) {
        editing = editing === slug ? null : slug;
    }

    type Page = (typeof data.pages)[number];

    let search = $state('');
    let view = $state<ViewMode>('cards');
    let filterValues = $state<Record<string, string>>({ status: '' });

    const visible = $derived(
        data.pages.filter(
            (p) =>
                matchesQuery(search, p.title, p.slug, p.content) &&
                (filterValues.status === '' ||
                    (filterValues.status === 'published') === p.visible),
        ),
    );

    // Searching the CONTENT too, not just the title: "where did I write the
    // data-protection paragraph" is the question these pages get asked.
    const FILTERS = [
        {
            id: 'status',
            label: 'Status',
            options: [
                { value: 'published', label: 'Published' },
                { value: 'draft', label: 'Draft' },
            ],
        },
    ];

    const COLUMNS: Column<Page>[] = [
        { key: 'title', label: 'Title', sort: (p) => p.title },
        { key: 'slug', label: 'URL', sort: (p) => p.slug },
        { key: 'status', label: 'Status', sort: (p) => (p.visible ? 0 : 1) },
        { key: 'order', label: 'Order', sort: (p) => p.order, align: 'right' },
        { key: 'actions', label: '', align: 'right' },
    ];
</script>

<svelte:head>
    <title>Platform pages · Hackagon</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl p-4 sm:p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Platform pages</h1>
            <p class="text-sm text-ink-3">
                About, Privacy, Terms and any other site-wide page. Content is markdown.
            </p>
        </div>
        <button class="btn btn-sm btn-accent" onclick={() => (creating = !creating)}>
            {creating ? 'Cancel' : 'New page'}
        </button>
    </div>

    {#if form?.message}
        <p class="mb-4 text-sm text-danger-ink">{form.message}</p>
    {/if}

    {#if creating}
        <form
            method="POST"
            action="?/create"
            use:enhance={() => async ({ update }) => { await update(); creating = false; }}
            class="card mb-6 flex flex-col gap-3 p-4"
        >
            <h2 class="font-bold">New page</h2>
            <div class="flex flex-col gap-3 sm:flex-row">
                <label class="flex-1">
                    <span class="text-sm">Slug</span>
                    <input name="slug" class="field" placeholder="code-of-conduct" required />
                </label>
                <label class="flex-1">
                    <span class="text-sm">Title</span>
                    <input name="title" class="field" placeholder="Code of conduct" required />
                </label>
                <label class="w-full sm:w-24">
                    <span class="text-sm">Order</span>
                    <input name="order" type="number" class="field" value="0" />
                </label>
            </div>
            <!-- `for=`/`id=` rather than a wrapping label: buttons are labelable,
                 so a label around the editor would bind to its Write tab
                 instead of the textarea. -->
            <div>
                <label class="text-sm" for="new-page-content">Content (markdown)</label>
                <MarkdownEditor
                    id="new-page-content"
                    name="content"
                    rows={10}
                    placeholder="## What this is&#10;&#10;Markdown. Use Insert image to add a picture."
                    uploadEndpoint={UPLOAD_ENDPOINT} browseEndpoint={UPLOAD_ENDPOINT}
                />
            </div>
            <label class="flex items-center gap-2">
                <input name="visible" type="checkbox" class="" />
                <span class="text-sm">Published</span>
            </label>
            <div>
                <button type="submit" class="btn btn-sm btn-accent">Create page</button>
            </div>
        </form>
    {/if}

    {#if data.pages.length === 0}
        <p class="text-ink-3">
            No platform pages yet. Create one — the footer links to
            <code>about</code>, <code>privacy</code> and <code>terms</code>.
        </p>
    {:else}
        <div class="mb-4">
            <DataToolbar
                bind:search
                bind:view
                bind:filterValues
                viewKey="manage-pages"
                filters={FILTERS}
                placeholder="Search title, URL or content…"
                summary="{data.pages.length} page{data.pages.length === 1 ? '' : 's'}"
                shown={visible.length}
                total={data.pages.length}
            />
        </div>
    {/if}

    {#if data.pages.length > 0 && visible.length === 0}
        <p class="py-6 text-center text-sm text-ink-3">No pages match your search.</p>
    {/if}

    {#if visible.length > 0 && view === 'table'}
        <DataTable
            columns={COLUMNS}
            rows={visible}
            rowKey={(p) => p.slug}
            caption="Platform pages"
        >
            {#snippet row(page)}
                <td class="px-3 py-2 font-medium">{page.title}</td>
                <td class="px-3 py-2"><code class="text-xs">/{page.slug}</code></td>
                <td class="px-3 py-2">
                    <span
                        class="badge {page.visible ? 'badge-success' : 'badge-warning'}"
                    >
                        {page.visible ? 'Published' : 'Draft'}
                    </span>
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{page.order}</td>
                <td class="px-3 py-2 text-right">
                    <RowActions label="Actions for {page.title}">
                        <!-- Editing opens the same form the card view uses, so
                             there is one editor rather than two to keep in
                             step; switching view is what reveals it. -->
                        <button
                            onclick={() => {
                                view = 'cards';
                                editing = page.slug;
                            }}>Edit</button
                        >
                        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- SitePage slug, not a typed route -->
                        <a href="/{page.slug}" target="_blank" rel="noopener">View page</a>
                        <form method="POST" action="?/delete" use:enhance>
                            <input type="hidden" name="slug" value={page.slug} />
                            <button type="submit" class="w-full text-danger-ink">Delete</button>
                        </form>
                    </RowActions>
                </td>
            {/snippet}
        </DataTable>
    {:else if visible.length > 0}
        <div class="flex flex-col gap-3">
            {#each visible as page (page.slug)}
                <div class="card p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <h2 class="font-bold">{page.title}</h2>
                                <span class="badge {page.visible ? 'badge-success' : 'badge-warning'}">
                                    {page.visible ? 'Published' : 'Draft'}
                                </span>
                            </div>
                            <p class="text-sm text-ink-3">
                                <code>/{page.slug}</code> · order {page.order}
                            </p>
                        </div>
                        <div class="flex shrink-0 flex-wrap gap-2">
                            <button
                                class="btn btn-sm"
                                onclick={() => toggleEdit(page.slug)}
                            >
                                {editing === page.slug ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/delete" use:enhance>
                                <input type="hidden" name="slug" value={page.slug} />
                                <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                            </form>
                        </div>
                    </div>

                    {#if editing === page.slug}
                        <form
                            method="POST"
                            action="?/edit"
                            use:enhance={() => async ({ update }) => { await update(); editing = null; }}
                            class="mt-4 flex flex-col gap-3 border-t border-line pt-4"
                        >
                            <input type="hidden" name="slug" value={page.slug} />
                            <div class="flex flex-col gap-3 sm:flex-row">
                                <label class="flex-1">
                                    <span class="text-sm">Title</span>
                                    <input name="title" class="field" value={page.title} required />
                                </label>
                                <label class="w-full sm:w-24">
                                    <span class="text-sm">Order</span>
                                    <input name="order" type="number" class="field" value={page.order} />
                                </label>
                            </div>
                            <div>
                                <label class="text-sm" for="content-{page.slug}">
                                    Content (markdown)
                                </label>
                                <MarkdownEditor
                                    id="content-{page.slug}"
                                    name="content"
                                    value={page.content}
                                    rows={16}
                                    uploadEndpoint={UPLOAD_ENDPOINT} browseEndpoint={UPLOAD_ENDPOINT}
                                />
                            </div>
                            <label class="flex items-center gap-2">
                                <input name="visible" type="checkbox" class="" checked={page.visible} />
                                <span class="text-sm">Published</span>
                            </label>
                            <div class="flex flex-wrap gap-2">
                                <button type="submit" class="btn btn-sm btn-accent">Save changes</button>
                                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- SitePage slug, not a typed route -->
                                <a href="/{page.slug}" class="btn btn-sm" target="_blank" rel="noopener">
                                    View page
                                </a>
                            </div>
                        </form>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
