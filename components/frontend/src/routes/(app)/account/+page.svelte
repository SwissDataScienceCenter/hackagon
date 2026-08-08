<script lang="ts">
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    let confirming = $state(false);

    /**
     * What a field should show: the value the person just typed if the save was
     * rejected, otherwise what is stored.
     *
     * The `in` check matters — a rejected save echoes back an EMPTY string for a
     * field someone deliberately cleared, and `??` would fall through to the
     * stored value and silently refill it in front of them.
     */
    function keep(name: string, stored: string | undefined): string {
        const echoed = form as Record<string, unknown> | null;
        if (echoed && name in echoed) return String(echoed[name] ?? '');

        return stored ?? '';
    }
</script>

<svelte:head><title>Your account · Hackagon</title></svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-10">
    <h1 class="m-0 text-title text-ink">Your account</h1>

    {#if data.user}
        <section class="card flex flex-col gap-4 p-4">
            <h2 class="m-0 text-section text-ink">Your profile</h2>

            <!-- Display name is the platform's own field: it is what everyone
                 else sees on your projects, teams and pages. Username and email
                 belong to the sign-in provider and are re-read from your token
                 on every request, so editing them here would be undone on the
                 next page load — they link out instead. -->
            <form method="POST" action="?/profile" use:enhance class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="field-label">Display name</span>
                    <input
                        name="displayName"
                        class="field"
                        maxlength="100"
                        required
                        value={keep('displayName', data.user.displayName)}
                    />
                    <span class="text-meta text-ink-3">
                        Shown next to everything you create here.
                    </span>
                </label>

                <!-- The four questions every event's registration form asks.
                     Answered once here, so an event can prefill them instead of
                     asking again — see the note below on what does NOT live
                     here. `field(...)` keys match the registration form's own
                     keys (affiliation, skills, diet, avatar) deliberately. -->
                <label class="flex flex-col gap-1">
                    <span class="field-label">Affiliation</span>
                    <input
                        name="affiliation"
                        class="field"
                        maxlength="200"
                        placeholder="ETH Zurich"
                        value={keep('affiliation', data.user.affiliation)}
                    />
                    <span class="text-meta text-ink-3">
                        University, company or institute. Organisers use it to see who is in
                        the room.
                    </span>
                </label>

                <label class="flex flex-col gap-1">
                    <span class="field-label">Skills</span>
                    <input
                        name="skills"
                        class="field"
                        maxlength="500"
                        placeholder="Python, ML, data viz"
                        value={keep('skills', data.user.skills)}
                    />
                    <span class="text-meta text-ink-3">
                        Comma separated. Team formation reads these.
                    </span>
                </label>

                <label class="flex flex-col gap-1">
                    <span class="field-label">Dietary requirements</span>
                    <input
                        name="dietary"
                        class="field"
                        maxlength="300"
                        placeholder="vegetarian, no nuts"
                        value={keep('dietary', data.user.dietary)}
                    />
                    <span class="text-meta text-ink-3">
                        Only shared with events that cater. Leave empty for none.
                    </span>
                </label>

                <label class="flex flex-col gap-1">
                    <span class="field-label">Profile picture</span>
                    <input
                        name="avatarUrl"
                        class="field"
                        type="url"
                        maxlength="500"
                        placeholder="https://…"
                        value={keep('avatarUrl', data.user.avatarUrl)}
                    />
                    <span class="text-meta text-ink-3">
                        A link, not an upload — there is no file storage yet. http or https
                        only.
                    </span>
                </label>

                {#if form?.profileMessage}
                    <p class="m-0 text-xs text-danger-ink" role="alert">{form.profileMessage}</p>
                {:else if form?.profileSaved}
                    <p class="m-0 text-xs text-success-ink">Saved.</p>
                {/if}

                <div>
                    <button type="submit" class="btn btn-accent">Save</button>
                </div>
            </form>

            <!-- The disclaimer. This page is the platform-wide profile; anything
                 an event asked you specifically — its extra questions, and every
                 consent you gave it — belongs to that event's registration and is
                 edited there. Consents especially: agreeing to one event's code
                 of conduct is not a standing agreement with the platform, and
                 showing it here would imply it was. -->
            <p class="m-0 border-t border-line pt-3 text-meta text-ink-3">
                This is your profile across the whole platform. Answers you gave to a
                <em>particular</em> event — its own extra questions, and the consents you
                agreed to, such as its code of conduct or event photography — live with that
                event's registration, not here: open the event and use
                <strong>“Your registration answers → View or edit”</strong>. Changing this
                profile does not change what an event already recorded, and organisers see
                the answers you gave them at the time.
            </p>

            <dl
                class="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-4 text-sm"
            >
                <dt class="text-ink-3">Username</dt>
                <dd class="m-0 text-ink">{data.user.username}</dd>
                <dt class="text-ink-3">Email</dt>
                <dd class="m-0 break-all text-ink">{data.user.email || '—'}</dd>
            </dl>

            <p class="m-0 text-meta text-ink-3">
                Your username, email and password live with your sign-in provider.
                <a href={data.identityConsoleUrl} rel="external noopener" target="_blank">
                    Change them there
                </a>
                — the new values appear here on your next sign-in.
            </p>
        </section>
    {/if}

    <!-- Session replay. Shown only where a deployment configured it at all, so
         an instance that does not record never advertises a setting that does
         nothing. The decision is stored in a cookie, not on the profile, which
         is why this section talks about "this browser" and not "your account" —
         see $lib/utils/replayConsent for why that is the honest scope. The form
         has no use:enhance on purpose: the 303 reloads the document, and the
         reloaded page is rendered by a server that has already read the new
         cookie, so withdrawing tears the running tracker down with the page
         rather than leaving it recording in a live document. -->
    {#if data.replay.configured}
        <section class="card flex flex-col gap-3 p-4">
            <h2 class="m-0 text-section text-ink">Session recording</h2>
            <p class="m-0 text-sm text-ink-2">
                We can record how <strong>this browser</strong> moves through the pages —
                clicks, scrolls and the structure of the page — to find buttons and links that
                do nothing. What you type and the text on the page are never sent, and a
                recording is never linked to your account.
            </p>

            <p class="m-0 text-sm text-ink" data-testid="replay-consent-state">
                {#if data.replay.consent === 'granted'}
                    Recording is <strong>on</strong> for this browser.
                {:else if data.replay.consent === 'denied'}
                    Recording is <strong>off</strong> for this browser.
                {:else}
                    Recording is <strong>off</strong> — you have not been asked yet.
                {/if}
            </p>

            <form method="POST" action="/consent/replay" class="flex flex-wrap gap-2">
                <input type="hidden" name="returnTo" value="/account" />
                {#if data.replay.consent === 'granted'}
                    <button type="submit" name="decision" value="denied" class="btn">
                        Stop recording this browser
                    </button>
                {:else}
                    <button type="submit" name="decision" value="granted" class="btn btn-accent">
                        Allow recording on this browser
                    </button>
                {/if}
            </form>
        </section>
    {/if}

    <section class="card flex flex-col gap-3 border-danger p-4">
        <h2 class="m-0 text-section text-ink">Delete your profile</h2>
        <p class="m-0 text-sm text-ink-2">
            This removes your Hackagon profile, your place on every hackathon roster, and all
            your roles. Your sign-in account is not deleted — you can sign in again later and
            start fresh.
        </p>
        <p class="m-0 text-sm text-ink-3">
            If you've published pages or submissions, an organiser has to reassign or remove
            them first; deleting your profile won't take other people's event records with it.
        </p>

        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        {#if !confirming}
            <div>
                <button class="btn btn-danger" onclick={() => (confirming = true)}>
                    Delete my profile
                </button>
            </div>
        {:else}
            <form method="POST" action="?/delete" use:enhance class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="field-label">
                        Type <code class="font-semibold text-ink">{data.user?.username}</code> to
                        confirm
                    </span>
                    <input name="confirm" class="field" autocomplete="off" required />
                </label>
                <div class="flex flex-wrap gap-2">
                    <button type="submit" class="btn btn-danger-solid">Permanently delete</button>
                    <button type="button" class="btn" onclick={() => (confirming = false)}>
                        Cancel
                    </button>
                </div>
            </form>
        {/if}
    </section>
</div>
