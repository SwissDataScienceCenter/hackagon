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

<section class="bg-surface-100-900 px-4 py-12 sm:px-10 md:px-20">
    <div class="mb-6 flex items-center justify-center gap-2">
        <PlayCircle class="h-5 w-5 text-primary-700-300" />
        <h2 class="text-xl font-bold">{title}</h2>
    </div>

    <div class="mx-auto max-w-4xl">
        <div
            class="relative aspect-video w-full overflow-hidden border border-surface-200-800
                   bg-surface-950"
        >
            <iframe
                src={embedUrl}
                title={title}
                class="h-full w-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            ></iframe>
        </div>
        <p class="mt-3 text-center text-xs text-surface-700-300">{caption}</p>
    </div>
</section>
