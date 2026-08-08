<script lang="ts">
    /*
     * "May we record this browser?" — asked once, before anything is recorded.
     *
     * It renders ONLY when a deployment has configured session replay and this
     * browser has not yet answered. Two properties matter more than how it
     * looks:
     *
     *  1. NOTHING IS RECORDED WHILE IT IS ON SCREEN. The banner is not a
     *     courtesy shown over a tracker that is already running — the server
     *     withheld the ingest endpoint and the project key, so there is nothing
     *     to run. See `+layout.server.ts`.
     *  2. IT WORKS WITH NO JAVASCRIPT AT ALL. Two plain submit buttons in one
     *     `<form method="POST">`, no `use:enhance`, no `onclick`. A control
     *     that only works after hydration has already shipped here once
     *     (`.claude/CLAUDE.md`, 2026-08-05: the account menu swallowed its
     *     first click), and a consent button that quietly does nothing is not
     *     a cosmetic bug — it records a "yes" that was never given, or drops a
     *     "no" that was.
     *
     * `returnTo` carries the current path so the 303 lands back where the
     * person was; the endpoint validates it before redirecting.
     */
    import { page } from '$app/state';

    let { consent, configured }: { consent: string | null; configured: boolean } = $props();

    const show = $derived(configured && consent === null);
    const returnTo = $derived(page.url.pathname + page.url.search);
</script>

{#if show}
    <div
        class="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-surface p-4 shadow-lg"
        role="region"
        aria-label="Session recording"
    >
        <div
            class="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <p class="m-0 text-sm text-ink-2">
                <strong class="text-ink">Help us find broken buttons?</strong>
                We can record how this browser moves through the pages — clicks, scrolls and
                page structure — to find controls that do nothing. What you type, and the text
                on the page, are never sent. Nothing is recorded unless you say yes, and you
                can change your mind on your account page.
            </p>

            <form
                method="POST"
                action="/consent/replay"
                class="flex shrink-0 flex-wrap items-center gap-2"
            >
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                    type="submit"
                    name="decision"
                    value="denied"
                    class="btn btn-sm"
                >
                    No thanks
                </button>
                <button
                    type="submit"
                    name="decision"
                    value="granted"
                    class="btn btn-sm btn-accent"
                >
                    Allow recording
                </button>
            </form>
        </div>
    </div>
{/if}
