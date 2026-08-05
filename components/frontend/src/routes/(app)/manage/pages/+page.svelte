<script lang="ts">
    import { enhance } from '$app/forms';
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import DataTable from '$lib/components/data/DataTable.svelte';
    import RowActions from '$lib/components/data/RowActions.svelte';
    import { matchesQuery, type Column, type ViewMode } from '$lib/utils/dataView';

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
            <p class="text-sm text-surface-500">
                About, Privacy, Terms and any other site-wide page. Content is markdown.
            </p>
        </div>
        <button class="btn btn-sm preset-filled-primary-500" onclick={() => (creating = !creating)}>
            {creating ? 'Cancel' : 'New page'}
        </button>
    </div>

    {#if form?.message}
        <p class="mb-4 text-sm text-error-500">{form.message}</p>
    {/if}

    {#if creating}
        <form
            method="POST"
            action="?/create"
            use:enhance={() => async ({ update }) => { await update(); creating = false; }}
            class="card preset-outlined-surface-200-800 mb-6 flex flex-col gap-3 p-4"
        >
            <h2 class="font-bold">New page</h2>
            <div class="flex flex-col gap-3 sm:flex-row">
                <label class="flex-1">
                    <span class="text-sm">Slug</span>
                    <input name="slug" class="input" placeholder="code-of-conduct" required />
                </label>
                <label class="flex-1">
                    <span class="text-sm">Title</span>
                    <input name="title" class="input" placeholder="Code of conduct" required />
                </label>
                <label class="w-full sm:w-24">
                    <span class="text-sm">Order</span>
                    <input name="order" type="number" class="input" value="0" />
                </label>
            </div>
            <label>
                <span class="text-sm">Content (markdown)</span>
                <textarea name="content" class="textarea min-h-40" rows="8"></textarea>
            </label>
            <label class="flex items-center gap-2">
                <input name="visible" type="checkbox" class="checkbox" />
                <span class="text-sm">Published</span>
            </label>
            <div>
                <button type="submit" class="btn btn-sm preset-filled-primary-500">Create page</button>
            </div>
        </form>
    {/if}

    {#if data.pages.length === 0}
        <p class="text-surface-500">
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
        <p class="py-6 text-center text-sm text-surface-500">No pages match your search.</p>
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
                        class="badge {page.visible ? 'preset-tonal-success' : 'preset-tonal-warning'}"
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
                        <a href="/{page.slug}" target="_blank" rel="noopener">View page</a>
                        <form method="POST" action="?/delete" use:enhance>
                            <input type="hidden" name="slug" value={page.slug} />
                            <button type="submit" class="w-full text-error-500">Delete</button>
                        </form>
                    </RowActions>
                </td>
            {/snippet}
        </DataTable>
    {:else if visible.length > 0}
        <div class="flex flex-col gap-3">
            {#each visible as page (page.slug)}
                <div class="card preset-outlined-surface-200-800 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <h2 class="font-bold">{page.title}</h2>
                                <span class="badge {page.visible ? 'preset-tonal-success' : 'preset-tonal-warning'}">
                                    {page.visible ? 'Published' : 'Draft'}
                                </span>
                            </div>
                            <p class="text-sm text-surface-500">
                                <code>/{page.slug}</code> · order {page.order}
                            </p>
                        </div>
                        <div class="flex shrink-0 flex-wrap gap-2">
                            <button
                                class="btn btn-sm preset-tonal-primary"
                                onclick={() => toggleEdit(page.slug)}
                            >
                                {editing === page.slug ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/delete" use:enhance>
                                <input type="hidden" name="slug" value={page.slug} />
                                <button type="submit" class="btn btn-sm preset-tonal-error">Delete</button>
                            </form>
                        </div>
                    </div>

                    {#if editing === page.slug}
                        <form
                            method="POST"
                            action="?/edit"
                            use:enhance={() => async ({ update }) => { await update(); editing = null; }}
                            class="mt-4 flex flex-col gap-3 border-t border-surface-200-800 pt-4"
                        >
                            <input type="hidden" name="slug" value={page.slug} />
                            <div class="flex flex-col gap-3 sm:flex-row">
                                <label class="flex-1">
                                    <span class="text-sm">Title</span>
                                    <input name="title" class="input" value={page.title} required />
                                </label>
                                <label class="w-full sm:w-24">
                                    <span class="text-sm">Order</span>
                                    <input name="order" type="number" class="input" value={page.order} />
                                </label>
                            </div>
                            <label>
                                <span class="text-sm">Content (markdown)</span>
                                <textarea name="content" class="textarea min-h-60" rows="14">{page.content}</textarea>
                            </label>
                            <label class="flex items-center gap-2">
                                <input name="visible" type="checkbox" class="checkbox" checked={page.visible} />
                                <span class="text-sm">Published</span>
                            </label>
                            <div class="flex flex-wrap gap-2">
                                <button type="submit" class="btn btn-sm preset-filled-primary-500">Save changes</button>
                                <a href="/{page.slug}" class="btn btn-sm preset-tonal" target="_blank" rel="noopener">
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
