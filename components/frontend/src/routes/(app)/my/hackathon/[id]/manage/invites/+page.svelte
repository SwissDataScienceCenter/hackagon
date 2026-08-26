<script lang="ts">
    import Ban from 'lucide-svelte/icons/ban';
    import Plus from 'lucide-svelte/icons/plus';
    import CopyField from '$lib/components/forms/CopyField.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Absolute dates, not "3 weeks ago". `relativeTime` only counts *down* to a
    // future boundary, and an organiser deciding whether a link is stale wants
    // the date they sent it, not an approximation of how long ago that was.
    function on(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // "Revoked" and "Expired" are lifecycle states, so they take status hues —
    // never `badge-accent`, which means the primary action or your own role.
    const deadBadge: Record<string, string> = {
        revoked: 'badge-danger',
        expired: 'badge-warning'
    };
</script>

<!--
  Invitation links for a private event.

  The page has exactly one job: put a URL on somebody's clipboard so they can
  paste it into a mailing. Everything else here exists to make that URL
  trustworthy — who it went to, when it stops working, and how to kill it.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Invitations</h1>
        <p class="m-0 text-xs text-ink-3">
            {data.hackathonName} is private, so it appears on no list and nobody can find
            it. A link is the way in — mail one out yourself, from wherever you send your
            invitations.
        </p>
    </div>

    <!-- Said once, at the top, because it is the thing an organiser most needs to
         know before pasting a link into a hundred inboxes. -->
    <section class="card flex flex-col gap-1 border-line-strong px-5 py-4">
        <span class="meta">What a link does</span>
        <p class="m-0 text-sm text-ink-2">
            Whoever holds it can see this event and ask to join. It does not let them
            in — you still confirm each person on the
            <span class="text-ink">Waitlist</span> page. So a link forwarded further than
            you meant cannot put a stranger in your roster.
        </p>
    </section>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {:else if form?.created}
        <p class="m-0 text-xs text-success-ink" role="status">
            New link created — it is at the top of the list.
        </p>
    {:else if form?.revoked}
        <p class="m-0 text-xs text-success-ink" role="status">
            Link revoked. It stops working immediately.
        </p>
    {/if}

    <!-- The live links: the reason for the page, so they come before anything
         that only records history. -->
    <section class="flex flex-col gap-3">
        <span class="meta">Live links</span>

        {#if data.live.length === 0}
            <div class="card flex flex-col gap-1 px-5 py-4">
                <p class="m-0 text-sm text-ink-3">
                    No working links. Nobody outside this event can reach it until you
                    make one.
                </p>
            </div>
        {:else}
            {#each data.live as invite (invite.id)}
                <div class="card flex flex-col gap-3 px-5 py-4">
                    <CopyField value={invite.url} label="Invitation link" />

                    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                        <div class="flex min-w-0 flex-col gap-0.5">
                            {#if invite.note}
                                <span class="text-sm text-ink-2">{invite.note}</span>
                            {:else}
                                <!-- Not silently blank: the note is how an organiser
                                     tells two links apart weeks later, and one
                                     without it is worth noticing. -->
                                <span class="text-sm text-ink-3">No note</span>
                            {/if}
                            <span class="tnum text-xs text-ink-3">
                                Made {on(invite.createdAt)}{#if invite.expiresAt}
                                    · stops working {on(invite.expiresAt)}{:else}
                                    · no end date{/if}
                            </span>
                        </div>

                        <form method="POST" action="?/revoke" class="shrink-0">
                            <input type="hidden" name="inviteId" value={invite.id} />
                            <button type="submit" class="btn btn-sm btn-quiet text-danger-ink">
                                <Ban class="h-3 w-3 shrink-0" aria-hidden="true" />
                                Revoke
                            </button>
                        </form>
                    </div>
                </div>
            {/each}
        {/if}
    </section>

    <!-- The one solid action on this page. Its own card at the foot rather than a
         button in the heading: the note is the input, and a note is worth typing
         rather than skipping. -->
    <section class="card flex flex-col gap-3 border-line-strong px-5 py-4">
        <span class="meta">New link</span>
        <form method="POST" action="?/create" class="flex flex-col gap-3">
            <label class="field-label">
                Who is it for? (optional)
                <input
                    type="text"
                    name="note"
                    maxlength="500"
                    placeholder="Partner mailing list"
                    class="field"
                />
            </label>
            <p class="m-0 text-xs text-ink-3">
                Only you see this. One link can be used by everybody you send it to, so a
                note naming the mailing is what tells two links apart later. It stops
                working when the event ends.
            </p>
            <button type="submit" class="btn btn-sm btn-solid w-fit">
                <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
                Create link
            </button>
        </form>
    </section>

    <!-- Kept on screen rather than dropped: the backend revokes by timestamp and
         never deletes, so a revoked link is a thing that happened and an
         organiser should be able to see that it did. No URL shown — copying a
         dead link is the one thing nobody wants to do by accident. -->
    {#if data.dead.length > 0}
        <section class="flex flex-col gap-3">
            <span class="meta">No longer working</span>
            {#each data.dead as invite (invite.id)}
                <div
                    class="card card-raised flex flex-wrap items-baseline justify-between
                           gap-x-6 gap-y-1 px-5 py-3"
                >
                    <div class="flex min-w-0 flex-col gap-0.5">
                        <span class="text-sm text-ink-2">{invite.note || 'No note'}</span>
                        <span class="tnum text-xs text-ink-3">
                            {#if invite.state === 'revoked'}
                                Revoked {on(invite.revokedAt)}
                            {:else}
                                Expired {on(invite.expiresAt)}
                            {/if}
                        </span>
                    </div>
                    <span class="badge shrink-0 {deadBadge[invite.state] ?? 'badge-neutral'}">
                        {invite.state === 'revoked' ? 'Revoked' : 'Expired'}
                    </span>
                </div>
            {/each}
        </section>
    {/if}
</div>
