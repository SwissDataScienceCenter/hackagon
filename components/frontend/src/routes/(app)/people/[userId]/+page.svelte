<script lang="ts">
    import { resolve } from '$app/paths';
    import ArrowLeft from 'lucide-svelte/icons/arrow-left';
    import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
    import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
    import { profileDisplayName } from '$lib/utils/profile';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const name = $derived(
        profileDisplayName(data.profile.displayName, data.profile.username)
    );
</script>

<svelte:head>
    <title>{name} · Hackagon</title>
</svelte:head>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- Only the admin users table links here (Get is admin-only), so that is
         where back goes. -->
    <a
        href={resolve('/(app)/manage/users')}
        class="flex w-fit items-center gap-1.5 text-xs text-surface-500 no-underline
               hover:text-surface-950-50"
    >
        <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
        All users
    </a>

    <ProfileHeader
        {name}
        username={data.profile.username}
        email={data.profile.email}
        title={data.profile.title}
        affiliation={data.profile.affiliation}
        linkedinUrl={data.profile.linkedinUrl}
        joinedAt={data.profile.createdAt}
        roles={data.profile.roles}
    />

    <ProfileAbout
        description={data.profile.description}
        emptyText="This user hasn't written anything about themselves yet."
    />
</div>
