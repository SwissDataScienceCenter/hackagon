<script lang="ts">
    import { resolve } from '$app/paths';
</script>
<aside class="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto
    bg-surface-900-50 border-r border-surface-300-700 p-4">
    <nav class="flex flex-col gap-1">
        <a href={resolve("/")} class="flex items-center gap-2 px-3 py-2 font-medium rounded-lg hover:bg-surface-700-200">
            Home
        </a>
        <div class="px-3 mt-4 mb-2 text-xs font-bold tracking-wider uppercase text-primary-500">
            Current Hackathon
        </div>
        <div class="px-3 mt-4 mb-2 text-xs font-bold tracking-wider uppercase text-primary-500">
            Useful Links
        </div>
    </nav>
</aside>
