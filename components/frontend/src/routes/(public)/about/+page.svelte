<script lang="ts">
    import { HACKATHON_CONTACT_EMAIL, HACKATHON_CONTACT_MAILTO } from '$lib/utils/contact';

    // The same four capabilities the landing page lists, in the order a
    // hackathon actually runs them. Stated here as sentences rather than as the
    // landing page's icon cards: someone who followed "About this platform"
    // came to read, not to scan.
    const STAGES = [
        {
            title: 'Registration',
            body: 'Participants sign up, answer whatever the organizers ask, and are confirmed or waitlisted.',
        },
        {
            title: 'Project proposal',
            body: 'Submit project ideas, browse proposals from other participants, and find the challenge that matches your skills.',
        },
        {
            title: 'Team formation',
            body: 'Rank your project preferences and get matched into balanced teams. Organizers can fine-tune assignments.',
        },
        {
            title: 'Voting',
            body: 'Participants and jury vote on submissions. Results are aggregated into a live leaderboard with configurable scoring.',
        },
        {
            title: 'Showcasing the results',
            body: 'Submit your project with links, repos, slides and demos. Draft and iterate before the final deadline.',
        },
    ];
</script>

<svelte:head>
    <title>About this platform — SDSC Hackathons</title>
    <meta
        name="description"
        content="The SDSC platform for running professional hackathons — from registration, project
                 proposal, team formation, voting and showcasing the results."
    />
</svelte:head>

<div class="mx-auto w-full max-w-7xl">
    <section class="px-4 py-12 sm:px-10 md:px-20">
        <!-- Prose measure rather than the full container: this page is read
             start to finish, and a 7xl line length is not readable. -->
        <div class="flex max-w-3xl flex-col gap-8">
            <div class="flex flex-col gap-4">
                <h1 class="m-0 text-display text-ink">About this platform</h1>
                <p class="text-base leading-relaxed text-ink-2">
                    This is the SDSC platform for running professional hackathons — from
                    registration, project proposal, team formation, voting and showcasing the
                    results.
                </p>
            </div>

            <div class="flex flex-col gap-4">
                <h2 class="m-0 text-title text-ink">What it covers</h2>
                <dl class="m-0 flex flex-col gap-4">
                    {#each STAGES as stage (stage.title)}
                        <div class="flex flex-col gap-1">
                            <dt class="text-section text-ink">{stage.title}</dt>
                            <dd class="m-0 text-sm leading-relaxed text-ink-3">{stage.body}</dd>
                        </div>
                    {/each}
                </dl>
            </div>

            <div class="flex flex-col gap-3">
                <h2 class="m-0 text-title text-ink">Run one with us</h2>
                <p class="text-base leading-relaxed text-ink-2">
                    SDSC provides the platform, tools, and expertise. Bring your challenge — we'll
                    help you run it.
                </p>
                <!-- The address in the text, not only behind the button: a
                     browser with no mail handler drops a `mailto:` click in
                     silence. Same reasoning as the landing page hero. -->
                <p class="text-sm text-ink-3">
                    Email
                    <!-- eslint-disable svelte/no-navigation-without-resolve -- mailto, not a route -->
                    <a href={HACKATHON_CONTACT_MAILTO} class="select-all font-mono text-ink-2">
                        {HACKATHON_CONTACT_EMAIL}
                    </a>
                    <!-- eslint-enable svelte/no-navigation-without-resolve -->
                </p>
            </div>
        </div>
    </section>
</div>
