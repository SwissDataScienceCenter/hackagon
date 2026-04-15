<script lang="ts">
    import { PlayCircle } from 'lucide-svelte';

    let {
        title,
        caption,
        videoUrl,
    }: {
        title: string;
        caption: string;
        videoUrl: string;
    } = $props();

    const embedUrl = videoUrl.includes('youtube.com/watch')
        ? videoUrl.replace('watch?v=', 'embed/')
        : videoUrl.includes('youtu.be/')
            ? `https://www.youtube.com/embed/${videoUrl.split('youtu.be/')[1]}`
            : videoUrl;
</script>

<section class="border-t border-surface-200 bg-surface-100 px-20 py-12 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-6 flex items-center justify-center gap-2">
        <PlayCircle class="h-5 w-5 text-primary-700 dark:text-primary-500" />
        <h2 class="text-xl font-bold">{title}</h2>
    </div>

    <div class="mx-auto max-w-[800px]">
        <div class="relative aspect-video w-full overflow-hidden border border-surface-200 bg-surface-950 dark:border-surface-800">
            <iframe
                src={embedUrl}
                title={title}
                class="h-full w-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            ></iframe>
        </div>
        <p class="mt-3 text-center text-xs text-surface-700 dark:text-surface-100">{caption}</p>
    </div>
</section>
