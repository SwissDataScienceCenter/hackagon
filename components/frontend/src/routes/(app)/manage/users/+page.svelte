<script lang="ts">
    const { data } = $props();
</script>

<div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Users</h1>
    {#if data.users.length === 0}
        <p class="text-gray-500">No users found.</p>
    {:else}
        <!-- Keycloak IDs are wide monospace: the table scrolls in its own
             container instead of stretching the page on phones. -->
        <div class="overflow-x-auto">
        <table class="w-full border-collapse">
            <thead>
                <tr class="border-b text-left">
                    <th class="py-2 pr-4">Name</th>
                    <th class="py-2 pr-4">Keycloak ID</th>
                    <th class="py-2">Created</th>
                </tr>
            </thead>
            <tbody>
                {#each data.users as user (user.keycloakId)}
                    <tr class="border-b">
                        <td class="py-2 pr-4">{user.displayName}</td>
                        <td class="py-2 pr-4 font-mono text-sm">{user.keycloakId}</td>
                        <td class="py-2">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        </div>
    {/if}
</div>
