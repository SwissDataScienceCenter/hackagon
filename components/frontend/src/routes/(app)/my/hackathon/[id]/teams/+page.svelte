<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';

    const { data, form } = $props();

    let creatingTeam = $state(false);
    let editingTeam = $state<string | null>(null);

    // The add-member select is driven by local state, which a reset would not
    // restore.
    const keepValues: SubmitFunction = () => async ({ update }) => update({ reset: false });
</script>

<div class="flex flex-col gap-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Teams</h1>
            {#if data.isOrganizer}
                <p class="text-sm text-surface-500">
                    A team hangs off an approved project. Adding someone here is what gives
                    them a seat — and the permissions that come with it.
                </p>
            {/if}
        </div>
        {#if data.isOrganizer}
            <button class="btn btn-sm preset-filled-primary-500"
                    onclick={() => (creatingTeam = !creatingTeam)}>
                {creatingTeam ? 'Cancel' : 'New team'}
            </button>
        {/if}
    </div>

    {#if form?.message}
        <p class="text-sm text-error-500">{form.message}</p>
    {/if}

    {#if creatingTeam}
        {#if data.projects.length === 0}
            <p class="card preset-outlined-warning-500 p-4 text-sm">
                No project has been approved yet, so there is nothing to build a team on.
            </p>
        {:else}
            <form method="POST" action="?/createTeam"
                  use:enhance={() => async ({ update }) => { await update(); creatingTeam = false; }}
                  class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                <label>
                    <span class="text-sm">Project</span>
                    <select name="projectId" class="select" required>
                        {#each data.projects as p (p.id)}
                            <option value={p.id}>{p.title}</option>
                        {/each}
                    </select>
                </label>
                <label>
                    <span class="text-sm">Name</span>
                    <input name="name" class="input" required />
                </label>
                <label>
                    <span class="text-sm">Description</span>
                    <textarea name="description" class="textarea" rows="3"></textarea>
                </label>
                <div><button class="btn btn-sm preset-filled-primary-500">Create team</button></div>
            </form>
        {/if}
    {/if}

    {#if data.teams.length === 0}
        <p class="text-surface-500">No teams yet.</p>
    {:else}
        <div class="flex flex-col gap-4">
            {#each data.teams as team (team.id)}
                <!-- Adding someone twice writes a duplicate join row, so they
                     are not offered again for this team. -->
                {@const seated = new Set(team.members.map((m) => m.id))}
                {@const addable = data.participants.filter((p) => !seated.has(p.id))}
                <div class="card preset-outlined-surface-200-800 p-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <h2 class="text-lg font-semibold">{team.name}</h2>
                            {#if team.projectTitle}
                                <p class="text-sm text-surface-500">Project: {team.projectTitle}</p>
                            {/if}
                        </div>
                        {#if data.isOrganizer}
                            <div class="flex shrink-0 flex-wrap gap-2">
                                <button class="btn btn-sm preset-tonal-primary"
                                        onclick={() => (editingTeam = editingTeam === team.id ? null : team.id)}>
                                    {editingTeam === team.id ? 'Close' : 'Edit'}
                                </button>
                                <form method="POST" action="?/deleteTeam" use:enhance>
                                    <input type="hidden" name="teamId" value={team.id} />
                                    <button class="btn btn-sm preset-tonal-error">Delete</button>
                                </form>
                            </div>
                        {/if}
                    </div>

                    {#if team.description}
                        <p class="mt-2 text-sm">{team.description}</p>
                    {/if}

                    <ul class="mt-3 flex flex-wrap gap-2">
                        {#each team.members as member (member.id)}
                            <li class="badge preset-tonal flex items-center gap-2 text-sm">
                                {member.name}
                                {#if data.isOrganizer}
                                    <form method="POST" action="?/removeUser" use:enhance>
                                        <input type="hidden" name="teamId" value={team.id} />
                                        <input type="hidden" name="userId" value={member.id} />
                                        <button class="text-error-500" aria-label="Remove {member.name}">
                                            ×
                                        </button>
                                    </form>
                                {/if}
                            </li>
                        {:else}
                            <li class="text-sm text-surface-500">Nobody on this team yet.</li>
                        {/each}
                    </ul>

                    {#if data.isOrganizer && addable.length > 0}
                        <form method="POST" action="?/assignUser" use:enhance={keepValues}
                              class="mt-4 flex flex-wrap items-end gap-2 border-t border-surface-200-800 pt-4">
                            <input type="hidden" name="teamId" value={team.id} />
                            <label class="min-w-40 flex-1">
                                <span class="text-sm">Add a participant</span>
                                <select name="userId" class="select" required>
                                    <option value="">Pick someone</option>
                                    {#each addable as p (p.id)}
                                        <option value={p.id}>{p.name}</option>
                                    {/each}
                                </select>
                            </label>
                            <button class="btn btn-sm preset-tonal-primary">Add to team</button>
                        </form>
                    {/if}

                    {#if editingTeam === team.id}
                        <form method="POST" action="?/editTeam"
                              use:enhance={() => async ({ update }) => { await update(); editingTeam = null; }}
                              class="mt-4 flex flex-col gap-3 border-t border-surface-200-800 pt-4">
                            <input type="hidden" name="teamId" value={team.id} />
                            <label>
                                <span class="text-sm">Name</span>
                                <input name="name" class="input" value={team.name} required />
                            </label>
                            <label>
                                <span class="text-sm">Description</span>
                                <textarea name="description" class="textarea" rows="3"
                                          >{team.description}</textarea>
                            </label>
                            <div><button class="btn btn-sm preset-filled-primary-500">Save team</button></div>
                        </form>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
