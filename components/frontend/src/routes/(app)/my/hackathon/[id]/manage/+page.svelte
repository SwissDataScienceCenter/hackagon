<script lang="ts">
    import { page as appPage } from '$app/stores';
    import { enhance } from '$app/forms';
    import { membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';

    const { data, form } = $props();

    const hackathonId = $derived($appPage.params.id);
    const origin = $derived($appPage.url.origin);

    // is_waiting is the waitlist flag; everyone on the roster holds the
    // Member role, so it is what separates "requested" from "confirmed".
    const waiting = $derived(data.members.filter((m) => m.isWaiting));
    const confirmed = $derived(data.members.filter((m) => !m.isWaiting));

    let editingPage = $state<string | null>(null);
    let creatingPage = $state(false);
    let copied = $state<string | null>(null);

    function inviteUrl(token: string): string {
        return `${origin}/invite/${token}`;
    }

    async function copy(token: string) {
        try {
            await navigator.clipboard.writeText(inviteUrl(token));
            copied = token;
            setTimeout(() => (copied = null), 2000);
        } catch {
            copied = null; // clipboard blocked; the link is selectable anyway
        }
    }
</script>

<div class="flex flex-col gap-8 p-4 sm:p-6">
    {#if form?.message}
        <p class="text-sm text-error-500">{form.message}</p>
    {/if}

    {#if !data.isOrganizer}
        <p class="text-surface-500">
            Only this event's organizers can manage it.
        </p>
    {:else}
        <!-- ── Participants ─────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Participants</h2>
                <p class="text-sm text-surface-500">
                    {confirmed.length} confirmed · {waiting.length} awaiting approval
                </p>
            </div>

            {#if waiting.length > 0}
                <div class="card preset-outlined-warning-500 p-4">
                    <h3 class="mb-3 font-semibold">Waiting for a decision</h3>
                    <div class="flex flex-col gap-2">
                        {#each waiting as m (m.user?.id)}
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span>{m.user?.displayName || m.user?.username}</span>
                                <div class="flex gap-2">
                                    <form method="POST" action="?/approve" use:enhance>
                                        <input type="hidden" name="userId" value={m.user?.id} />
                                        <button class="btn btn-sm preset-filled-primary-500">Approve</button>
                                    </form>
                                    <form method="POST" action="?/remove" use:enhance>
                                        <input type="hidden" name="userId" value={m.user?.id} />
                                        <button class="btn btn-sm preset-tonal-error">Decline</button>
                                    </form>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <div class="card preset-outlined-surface-200-800 overflow-x-auto p-4">
                <h3 class="mb-3 font-semibold">On the roster</h3>
                {#if confirmed.length === 0}
                    <p class="text-sm text-surface-500">Nobody confirmed yet.</p>
                {:else}
                    <div class="flex flex-col gap-2">
                        {#each confirmed as m (m.user?.id)}
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="flex items-center gap-2">
                                    {m.user?.displayName || m.user?.username}
                                    <span class="badge {membershipBadgePreset(m.isWaiting)}">
                                        {membershipBadgeLabel(m.isWaiting, m.role)}
                                    </span>
                                </span>
                                <form method="POST" action="?/remove" use:enhance>
                                    <input type="hidden" name="userId" value={m.user?.id} />
                                    <button class="btn btn-sm preset-tonal-error">Remove</button>
                                </form>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </section>

        <!-- ── Invitation links ─────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Invitation links</h2>
                <p class="text-sm text-surface-500">
                    Anyone with a link can see this event and request a place — you still
                    approve them above. Send links by email; revoke one if it spreads
                    further than you meant.
                </p>
            </div>

            <form method="POST" action="?/createInvite" use:enhance
                  class="card preset-outlined-surface-200-800 flex flex-wrap items-end gap-3 p-4">
                <label class="flex-1">
                    <span class="text-sm">Who is this for? (optional reminder)</span>
                    <input name="note" class="input" placeholder="Partner labs" />
                </label>
                <button class="btn preset-filled-primary-500">Generate link</button>
            </form>

            {#each data.invites as inv (inv.id)}
                <div class="card preset-outlined-surface-200-800 flex flex-wrap items-center justify-between gap-3 p-4">
                    <div class="min-w-0">
                        {#if inv.note}<p class="font-semibold">{inv.note}</p>{/if}
                        <code class="text-xs break-all">{inviteUrl(inv.token)}</code>
                    </div>
                    <div class="flex shrink-0 gap-2">
                        <button class="btn btn-sm preset-tonal" onclick={() => copy(inv.token)}>
                            {copied === inv.token ? 'Copied' : 'Copy'}
                        </button>
                        <form method="POST" action="?/revokeInvite" use:enhance>
                            <input type="hidden" name="inviteId" value={inv.id} />
                            <button class="btn btn-sm preset-tonal-error">Revoke</button>
                        </form>
                    </div>
                </div>
            {:else}
                <p class="text-sm text-surface-500">No links yet.</p>
            {/each}
        </section>

        <!-- ── Event pages ──────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-xl font-bold">Event pages</h2>
                    <p class="text-sm text-surface-500">
                        News, schedules and wrap-up posts shown on this event's public page.
                        Content is markdown.
                    </p>
                </div>
                <button class="btn btn-sm preset-filled-primary-500"
                        onclick={() => (creatingPage = !creatingPage)}>
                    {creatingPage ? 'Cancel' : 'New page'}
                </button>
            </div>

            {#if creatingPage}
                <form method="POST" action="?/createPage"
                      use:enhance={() => async ({ update }) => { await update(); creatingPage = false; }}
                      class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                    <label>
                        <span class="text-sm">Title</span>
                        <input name="title" class="input" required minlength="3" />
                    </label>
                    <label>
                        <span class="text-sm">Content (markdown)</span>
                        <textarea name="content" class="textarea min-h-40" rows="8"></textarea>
                    </label>
                    <label class="flex items-center gap-2">
                        <input name="visible" type="checkbox" class="checkbox" checked />
                        <span class="text-sm">Visible to participants</span>
                    </label>
                    <div><button class="btn btn-sm preset-filled-primary-500">Create page</button></div>
                </form>
            {/if}

            {#each data.pages as p (p.id)}
                <div class="card preset-outlined-surface-200-800 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <span class="flex items-center gap-2">
                            <span class="font-semibold">{p.title}</span>
                            <span class="badge {p.visible ? 'preset-tonal-success' : 'preset-tonal-warning'}">
                                {p.visible ? 'Visible' : 'Hidden'}
                            </span>
                        </span>
                        <div class="flex shrink-0 gap-2">
                            <button class="btn btn-sm preset-tonal-primary"
                                    onclick={() => (editingPage = editingPage === p.id ? null : p.id)}>
                                {editingPage === p.id ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/deletePage" use:enhance>
                                <input type="hidden" name="pageId" value={p.id} />
                                <button class="btn btn-sm preset-tonal-error">Delete</button>
                            </form>
                        </div>
                    </div>

                    {#if editingPage === p.id}
                        <form method="POST" action="?/editPage"
                              use:enhance={() => async ({ update }) => { await update(); editingPage = null; }}
                              class="mt-4 flex flex-col gap-3 border-t border-surface-200-800 pt-4">
                            <input type="hidden" name="pageId" value={p.id} />
                            <label>
                                <span class="text-sm">Title</span>
                                <input name="title" class="input" value={p.title} required minlength="3" />
                            </label>
                            <label>
                                <span class="text-sm">Content (markdown)</span>
                                <textarea name="content" class="textarea min-h-60" rows="12">{p.content}</textarea>
                            </label>
                            <label class="flex items-center gap-2">
                                <input name="visible" type="checkbox" class="checkbox" checked={p.visible} />
                                <span class="text-sm">Visible to participants</span>
                            </label>
                            <div class="flex flex-wrap gap-2">
                                <button class="btn btn-sm preset-filled-primary-500">Save changes</button>
                                <a href="/hackathon/{hackathonId}" class="btn btn-sm preset-tonal"
                                   target="_blank" rel="noopener">View public page</a>
                            </div>
                        </form>
                    {/if}
                </div>
            {:else}
                <p class="text-sm text-surface-500">No pages yet.</p>
            {/each}
        </section>
    {/if}
</div>
