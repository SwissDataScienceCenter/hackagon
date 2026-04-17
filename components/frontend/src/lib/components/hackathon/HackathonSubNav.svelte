<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/stores';

    let {
        tabs,
        slug,
    }: {
        tabs: { id: string; label: string }[];
        slug: string;
    } = $props();

    function tabHref(tabId: string) {
        return resolve(`/hackathon/${slug}/${tabId}`);
    }
</script>

<nav class="flex justify-center border-b border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-950">
    {#each tabs as tab (tab.id)}
        {@const href = tabHref(tab.id)}
        {@const isActive = $page.url.pathname.endsWith(`/${tab.id}`)}
        <a
            {href}
            class="flex h-11 items-center px-4 text-xs font-medium no-underline transition-colors
                   {isActive
                       ? 'border-b-2 border-primary-500 text-primary-700 dark:text-primary-500'
                       : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}"
        >
            {tab.label}
        </a>
    {/each}
</nav>
