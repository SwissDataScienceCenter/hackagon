<script lang="ts">
    import { page } from '$app/stores';

    // Every <meta> a link preview needs, in one place. Before this the app had
    // no OpenGraph at all: pasting a link into Slack, Teams or a chat showed
    // the bare URL, and the landing page did not even carry a <title>.
    //
    // Put it in the page, not the layout: a layout cannot know the event name,
    // and duplicate og:title tags (one from each level) are worse than none —
    // crawlers pick one and it is not always yours.

    let {
        /** Page name. Omitted on the landing page, which is just the site. */
        title = '',
        description = 'One place for the whole hackathon — call for projects, teams, submissions and the final vote.',
        // JPEG on purpose, unlike every other image here. This one is not
        // fetched by a browser — it is fetched by link-preview scrapers
        // (Slack, LinkedIn, WhatsApp), whose WebP support is broad but not
        // universal, and a card that fails to render costs more than the 30 KB
        // WebP would have saved on a request no visitor ever makes.
        image = '/og-default.jpg',
        /** Only meaningful for the default image; a custom one should pass its own. */
        imageWidth = 1200,
        imageHeight = 630,
        type = 'website',
        /** Pages that must never be indexed: anything reached with a secret in the URL. */
        noindex = false,
    }: {
        title?: string;
        description?: string;
        image?: string;
        imageWidth?: number;
        imageHeight?: number;
        type?: 'website' | 'article';
        noindex?: boolean;
    } = $props();

    const SITE = 'Hackagon';

    // Skip the suffix when the name already carries it — an admin page called
    // "About Hackagon" would otherwise read "About Hackagon · Hackagon".
    const fullTitle = $derived(
        !title
            ? `${SITE} — SDSC Hackathon Platform`
            : title.includes(SITE)
              ? title
              : `${title} · ${SITE}`,
    );

    // Absolute URLs, derived from the request rather than hardcoded: crawlers
    // reject a relative og:image, and this app is served from localhost, from
    // an ephemeral tunnel hostname, and (eventually) from production — a
    // baked-in origin would be wrong in two of the three.
    //
    // publicOrigin (root layout load) is what the VISITOR reached, taken from
    // the proxy's X-Forwarded-* headers; $page.url.origin is the internal one,
    // which behind the tunnel is plain http.
    const origin = $derived($page.data.publicOrigin ?? $page.url.origin);
    const canonical = $derived(origin + $page.url.pathname);
    const absoluteImage = $derived(image.startsWith('http') ? image : origin + image);

    // A one-line summary: newlines and runs of spaces render as literal gaps in
    // a preview card, and markdown syntax leaks through if the source is a page
    // body rather than prose written for this.
    const summary = $derived(description.replace(/\s+/g, ' ').trim().slice(0, 200));
</script>

<svelte:head>
    <title>{fullTitle}</title>
    <meta name="description" content={summary} />
    <link rel="canonical" href={canonical} />
    {#if noindex}
        <meta name="robots" content="noindex, nofollow" />
    {/if}

    <meta property="og:site_name" content={SITE} />
    <meta property="og:type" content={type} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={summary} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={absoluteImage} />
    <meta property="og:image:width" content={String(imageWidth)} />
    <meta property="og:image:height" content={String(imageHeight)} />
    <meta property="og:image:alt" content={fullTitle} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={fullTitle} />
    <meta name="twitter:description" content={summary} />
    <meta name="twitter:image" content={absoluteImage} />
</svelte:head>
