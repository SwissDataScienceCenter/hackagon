<script lang="ts">
    let {
        title,
        filename,
        text,
    }: {
        title: string;
        filename: string;
        text: string;
    } = $props();

    let copied = $state(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            copied = false; // clipboard blocked; the payload below is selectable anyway
        }
    }

    function download() {
        // The payload already crossed the wire as form data, so it is turned into
        // a file here rather than fetched again from a second endpoint.
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="card btn-quiet flex flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
            <h3 class="break-words font-semibold">{title}</h3>
            <p class="text-xs text-ink-3">{filename} · {text.length} characters</p>
        </div>
        <div class="flex shrink-0 gap-2">
            <button class="btn btn-sm" onclick={copy}>
                {copied ? 'Copied' : 'Copy'}
            </button>
            <button class="btn btn-sm btn-accent" onclick={download}>
                Download
            </button>
        </div>
    </div>
    <pre class="max-h-64 overflow-auto rounded bg-raised p-3 text-xs">{text}</pre>
</div>
