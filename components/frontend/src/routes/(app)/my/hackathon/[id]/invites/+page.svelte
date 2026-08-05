<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // The link a recipient actually opens. Built from the browsing origin so it
    // is correct on localhost, through the dev tunnel and in production alike —
    // an organiser copies this into an email, so a wrong host is a dead link.
    const linkFor = (token: string) => `${$page.url.origin}/invite/${token}`;

    let copied = $state('');

    async function copy(token: string) {
        await navigator.clipboard.writeText(linkFor(token));
        copied = token;
        setTimeout(() => (copied = ''), 2000);
    }

    function when(d: Date | string | undefined): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }

    const live = $derived(data.invites.filter((i) => !i.revokedAt));
    const revoked = $derived(data.invites.filter((i) => i.revokedAt));
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Invitation links</h1>
        <p class="m-0 text-xs text-ink-3">
            Anyone with a link can see this event and request a place — you still approve them
            on the Participants page. Revoke a link if it spreads further than you meant.
        </p>
    </div>

    {#if !data.isPrivate}
        <p class="m-0 text-xs text-ink-3">
            This event is public, so anyone can already find it. Links still work, and are
            useful for inviting specific people directly.
        </p>
    {/if}

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <form method="POST" action="?/create" use:enhance class="card flex flex-col gap-3 p-4">
        <label class="flex flex-col gap-1">
            <span class="field-label">Who is this for? (optional reminder)</span>
            <input name="note" class="field" placeholder="Partner labs" maxlength="200" />
            <span class="text-meta text-ink-3">
                Only you see this — it is how you tell two links apart later.
            </span>
        </label>
        <div>
            <button type="submit" class="btn btn-accent">Generate link</button>
        </div>
    </form>

    {#if data.invites.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No links yet.</p>
    {:else}
        <div class="flex flex-col gap-2">
            {#each [...live, ...revoked] as invite (invite.id)}
                <div
                    class="card flex flex-wrap items-center justify-between gap-3 p-3
                           {invite.revokedAt ? 'opacity-60' : ''}"
                >
                    <div class="flex min-w-0 flex-col gap-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-sm font-semibold text-ink">
                                {invite.note || 'Untitled link'}
                            </span>
                            {#if invite.revokedAt}
                                <span class="badge badge-neutral">Revoked</span>
                            {/if}
                        </div>
                        <!-- The whole link, not a truncated hint: it is a
                             credential someone has to paste somewhere. -->
                        <code class="text-meta break-all text-ink-3">{linkFor(invite.token)}</code>
                        <span class="text-meta text-ink-3">Created {when(invite.createdAt)}</span>
                    </div>

                    {#if !invite.revokedAt}
                        <div class="flex shrink-0 flex-wrap gap-2">
                            <button class="btn btn-sm" onclick={() => copy(invite.token)}>
                                {copied === invite.token ? 'Copied' : 'Copy link'}
                            </button>
                            <form method="POST" action="?/revoke" use:enhance>
                                <input type="hidden" name="inviteId" value={invite.id} />
                                <button type="submit" class="btn btn-sm btn-danger">Revoke</button>
                            </form>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
