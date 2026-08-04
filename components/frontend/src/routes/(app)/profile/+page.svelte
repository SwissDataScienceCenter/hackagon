<script lang="ts">
    import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
    import { profileDisplayName } from '$lib/utils/profile';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const name = $derived(
        profileDisplayName(data.profile.displayName, data.profile.username)
    );
</script>

<svelte:head>
    <title>My profile · Hackagon</title>
</svelte:head>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">My Profile</h1>
        <p class="m-0 text-xs text-surface-500">
            How you appear to organisers and other participants
        </p>
    </div>

    <ProfileHeader
        {name}
        username={data.profile.username}
        email={data.profile.email}
        joinedAt={data.profile.createdAt}
        roles={data.profile.roles}
    />

    <!--
      Read-only by design, not by omission. Name and email are owned by Keycloak —
      WhoAmI rewrites both from the JWT on every request — and the remaining
      profile fields this page was asked for (affiliation, job title, skills, bio)
      do not exist on the User entity, so there is nothing here to edit and no
      endpoint to edit it with. Once those columns and a UserService.Edit RPC
      land, this is where the form goes.
    -->
    <p class="m-0 text-xs leading-snug text-surface-500">
        Your name and email come from your login account. To change them, use your
        account provider.
    </p>
</div>
