<script lang="ts">
    import { adviseImageUrl, usableImage } from '$lib/utils/imageUrl';
    import { isHttpUrl } from '$lib/utils/url';
    import StoredImage from '$lib/components/hackathon/StoredImage.svelte';

    let {
        name,
        label,
        value = $bindable(''),
        placeholder = 'https://…',
        fieldClass = 'field',
        labelClass = 'field-label',
        class: wrapperClass = '',
    }: {
        name: string;
        /** The caption above the input, e.g. "Logo URL (optional)". */
        label: string;
        value?: string;
        placeholder?: string;
        /** The host form's input and label classes — two of the four forms using
         *  this still carry their own pair rather than the `field`/`field-label`
         *  utilities, and a field ignoring them would be the one odd control on
         *  the page. */
        fieldClass?: string;
        labelClass?: string;
        class?: string;
    } = $props();

    // A wrapping <label> would have to contain the button below, and a label
    // holding interactive content is a trap for anyone reaching it by keyboard.
    // Explicit `for` instead — the same shape the markdown fields already use.
    const fieldId = `image-url-${name}`;

    // There is no upload anywhere on the platform: the picture is whatever URL
    // this field ends up holding. So the field has to be where a bad link is
    // caught — after the save there is nothing left but a broken image on
    // somebody else's page, with no hint of which link did it.
    //
    // `value` is that text and it is bindable, so a page previewing what it is
    // about to save reads the address from the field itself rather than keeping
    // a second copy of it that can drift.

    // The address the preview is currently trying. A beat behind the field, so a
    // half-typed host is not requested character by character and the verdict
    // below does not contradict itself mid-word.
    let probed = $state(value.trim());
    $effect(() => {
        const next = value.trim();
        const timer = setTimeout(() => (probed = next), 500);
        return () => clearTimeout(timer);
    });

    // Loading it is the only honest test. Pattern-matching names the share links
    // people actually paste, but it cannot tell a direct URL that 404s from one
    // that works, and those are half the failures. An `<img>` is also the one
    // probe with no CORS to satisfy and no server of ours in the middle: exactly
    // what the real page will do, done early enough to fix.
    //
    // Both recorded as *which* address settled rather than as a boolean, so
    // correcting the field leaves the verdict behind on its own.
    let loaded = $state('');
    let failed = $state('');

    const advice = $derived(adviseImageUrl(probed));
    const previewable = $derived(probed !== '' && isHttpUrl(probed));
    const showImage = $derived(previewable && usableImage(probed, failed));
    const checking = $derived(showImage && loaded !== probed);
</script>

<div class="{labelClass} {wrapperClass}">
    <label for={fieldId}>{label}</label>
    <input
        id={fieldId}
        type="url"
        {name}
        {placeholder}
        bind:value={value}
        class={fieldClass}
    />

    <!-- The instruction, not just the rule. "A link to the image file itself"
         describes the destination without saying how to get one, and the way to
         get one is a menu item most people have never had a reason to notice. -->
    <span class="font-normal text-ink-3">
        A link to the image file itself — a share or page link will not render. In
        most browsers: right-click the picture and choose
        <span class="text-ink-2">Copy image address</span>
        (Firefox calls it <span class="text-ink-2">Copy Image Link</span>).
    </span>

    {#if probed !== ''}
        <!-- Deliberately not `aria-live`: this settles a beat after typing stops
             and would interrupt somebody still filling the form in. It sits
             beside the field they are already looking at. -->
        <div class="flex flex-col items-start gap-2 pt-1 font-normal">
            {#if showImage}
                <!-- The same component the public page and About draw with, at a
                     smaller height cap. A 64px square box stood here saying "this
                     is what will be shown", which was true of no shape but a
                     square: a wide banner was boxed and a poster shrunk to a
                     stamp, and neither looked like the page it was previewing.
                     Kept in the tree while it loads rather than swapped in on
                     success — the load *is* the check, so something has to be
                     doing it, which is what the opacity is for. -->
                <StoredImage
                    src={probed}
                    maxHeight="max-h-40"
                    class="max-w-sm {checking ? 'opacity-0' : ''}"
                    onload={() => (loaded = probed)}
                    onerror={() => (failed = probed)}
                />
            {/if}

            <span class="flex min-w-0 flex-col items-start gap-1">
                {#if checking}
                    <span class="text-ink-3">Checking the link…</span>
                {:else if showImage}
                    <span class="text-ink-2">This is what will be shown.</span>
                {:else}
                    <!-- Two separate claims, so two lines: the first is
                         demonstrated, the second is a guess at the cause and is
                         only offered for an address whose shape we recognise. -->
                    <span class="text-danger-ink">
                        {previewable
                            ? 'This link does not load as an image.'
                            : 'This is not a link a browser can open.'}
                    </span>
                {/if}

                {#if advice.problem}
                    <span class="text-ink-3">{advice.problem}</span>
                {/if}

                {#if advice.direct}
                    <!-- Offered, not applied. Rewriting the field under someone
                         mid-form takes the address away from them; a button they
                         press leaves them holding the decision, with the preview
                         beside it showing what pressing it gets. -->
                    <button
                        type="button"
                        class="btn btn-sm btn-outline"
                        onclick={() => (value = advice.direct ?? value)}
                    >
                        Use the direct link
                    </button>
                {/if}
            </span>
        </div>
    {/if}
</div>
