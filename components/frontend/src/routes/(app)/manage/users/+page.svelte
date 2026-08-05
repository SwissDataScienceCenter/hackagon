<script lang="ts">
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import DataTable from '$lib/components/data/DataTable.svelte';
    import { matchesQuery, type Column, type FilterDef, type ViewMode } from '$lib/utils/dataView';

    const { data } = $props();

    type User = (typeof data.users)[number];

    // GlobalRole: UNSPECIFIED=0, ADMIN=1, HACKATHON_ORGANIZER=2. Raw numbers on
    // purpose — the generated enum lives under $lib/server.
    const ROLE_LABEL: Partial<Record<number, string>> = {
        1: 'Admin',
        2: 'Organizer',
    };

    function roleNames(u: User): string {
        return (u.roles ?? [])
            .map((r) => ROLE_LABEL[r])
            .filter(Boolean)
            .join(', ');
    }

    function created(u: User): string {
        return u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-CH') : '—';
    }

    let search = $state('');
    // Users are a long flat list; the table is the useful default here, unlike
    // the pages CMS where each card carries an editor.
    let view = $state<ViewMode>('table');
    let filterValues = $state<Record<string, string>>({ role: '' });

    const visible = $derived(
        data.users.filter((u) => {
            const wanted = filterValues.role;
            const roles = u.roles ?? [];
            const roleOk =
                wanted === ''
                    ? true
                    : wanted === 'none'
                      ? roles.filter((r) => r !== 0).length === 0
                      : roles.includes(Number(wanted));

            return (
                roleOk &&
                matchesQuery(search, u.displayName, u.username, u.email, u.keycloakId)
            );
        }),
    );

    const FILTERS: FilterDef[] = [
        {
            id: 'role',
            label: 'Role',
            options: [
                { value: '1', label: 'Admin' },
                { value: '2', label: 'Organizer' },
                { value: 'none', label: 'No global role' },
            ],
        },
    ];

    const COLUMNS: Column<User>[] = [
        { key: 'name', label: 'Name', sort: (u) => u.displayName || u.username },
        { key: 'username', label: 'Username', sort: (u) => u.username },
        { key: 'email', label: 'Email', sort: (u) => u.email ?? '', class: 'hidden md:table-cell' },
        { key: 'roles', label: 'Global role', sort: (u) => roleNames(u) },
        {
            key: 'keycloak',
            label: 'Keycloak ID',
            class: 'hidden xl:table-cell',
        },
        {
            key: 'created',
            label: 'First seen',
            sort: (u) => (u.createdAt ? new Date(u.createdAt).getTime() : 0),
            align: 'right',
        },
    ];
</script>

<svelte:head><title>Users · Hackagon</title></svelte:head>

<div class="mx-auto w-full max-w-6xl p-4 sm:p-6">
    <div class="mb-4">
        <h1 class="text-2xl font-bold">Users</h1>
        <p class="text-sm text-surface-500">
            Everyone who has signed in at least once — profiles are created on first login.
        </p>
    </div>

    {#if data.users.length === 0}
        <p class="text-surface-500">No users found.</p>
    {:else}
        <div class="mb-4">
            <DataToolbar
                bind:search
                bind:view
                bind:filterValues
                viewKey="manage-users"
                filters={FILTERS}
                placeholder="Search name, username, email or ID…"
                summary="{data.users.length} user{data.users.length === 1 ? '' : 's'}"
                shown={visible.length}
                total={data.users.length}
            />
        </div>

        <!-- There is deliberately no per-row action menu: granting and revoking
             global roles are proto-only stubs today (AddRole/RemoveRole return
             Unimplemented), and a button that cannot work is worse than none. -->
        {#if view === 'table'}
            <DataTable columns={COLUMNS} rows={visible} rowKey={(u) => u.keycloakId} caption="Platform users" empty="No users match your search.">
                {#snippet row(u)}
                    <td class="px-3 py-2 font-medium">{u.displayName || u.username}</td>
                    <td class="px-3 py-2 text-surface-500">@{u.username}</td>
                    <td class="hidden px-3 py-2 break-all md:table-cell">{u.email || '—'}</td>
                    <td class="px-3 py-2">
                        {#if roleNames(u)}
                            <span class="badge preset-tonal-primary">{roleNames(u)}</span>
                        {:else}
                            <span class="text-surface-500">—</span>
                        {/if}
                    </td>
                    <td class="hidden px-3 py-2 font-mono text-xs xl:table-cell">{u.keycloakId}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">{created(u)}</td>
                {/snippet}
            </DataTable>
        {:else if visible.length === 0}
            <p class="py-6 text-center text-sm text-surface-500">No users match your search.</p>
        {:else}
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {#each visible as u (u.keycloakId)}
                    <div class="card preset-outlined-surface-200-800 flex flex-col gap-1 p-4">
                        <div class="flex items-center justify-between gap-2">
                            <span class="truncate font-semibold">{u.displayName || u.username}</span>
                            {#if roleNames(u)}
                                <span class="badge preset-tonal-primary shrink-0">{roleNames(u)}</span>
                            {/if}
                        </div>
                        <span class="truncate text-sm text-surface-500">@{u.username}</span>
                        {#if u.email}
                            <span class="truncate text-sm break-all text-surface-500">{u.email}</span>
                        {/if}
                        <span class="mt-1 text-xs text-surface-500">First seen {created(u)}</span>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>
