<script lang="ts">
    import Pencil from 'lucide-svelte/icons/pencil';
    import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
    import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
    import ProfileEditForm from '$lib/components/profile/ProfileEditForm.svelte';
    import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
    import { profileDisplayName, type ProfileDraft } from '$lib/utils/profile';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let editing = $state(false);

    // TODO(backend: user-profile-fields): the edited copy lives here and nowhere
    // else. UserService has no write RPC — no Edit, no UpdateProfile — so there
    // is nothing to POST to and a reload discards this. Seeded from the loader so
    // the form opens on the placeholder copy. When the RPC lands, ProfileEditForm
    // becomes method="POST" + use:enhance against a form action and this state
    // goes away with the banner below.
    let draft = $state<ProfileDraft>({
        affiliation: data.profile.affiliation,
        title: data.profile.title,
        description: data.profile.description,
        linkedinUrl: data.profile.linkedinUrl
    });

    // Only after an edit in this tab — no point warning about unsaved work before
    // any exists.
    let dirty = $state(false);

    const name = $derived(
        profileDisplayName(data.profile.displayName, data.profile.username)
    );

    function handleSave(next: ProfileDraft) {
        draft = next;
        dirty = true;
        editing = false;
    }
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
        title={draft.title}
        affiliation={draft.affiliation}
        linkedinUrl={draft.linkedinUrl}
        joinedAt={data.profile.createdAt}
        roles={data.profile.roles}
    >
        {#snippet actions()}
            {#if !editing}
                <button
                    type="button"
                    onclick={() => (editing = true)}
                    class="btn btn-sm preset-tonal-surface"
                >
                    <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                </button>
            {/if}
        {/snippet}
    </ProfileHeader>

    <!-- Says plainly that nothing persists yet. A form that looked like it saved
         and then silently lost the text would be worse than no form at all. -->
    <div
        class="flex items-start gap-2 border border-warning-500 bg-warning-500/10 px-4 py-3"
        role="status"
    >
        <TriangleAlert
            class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-700-300"
            aria-hidden="true"
        />
        <p class="m-0 text-xs leading-snug text-surface-950-50">
            <span class="font-semibold">Preview only.</span>
            Profile fields aren't stored yet — the backend has no affiliation, title or
            description on a user, and no endpoint to save one. Edits here show how the
            page will look and are lost on reload.
        </p>
    </div>

    {#if editing}
        <ProfileEditForm
            affiliation={draft.affiliation}
            title={draft.title}
            description={draft.description}
            linkedinUrl={draft.linkedinUrl}
            onsave={handleSave}
            oncancel={() => (editing = false)}
        />
    {:else}
        {#if dirty}
            <p class="m-0 text-xs text-surface-500">
                Showing your unsaved changes from this tab.
            </p>
        {/if}
        <ProfileAbout
            description={draft.description}
            emptyText="You haven't written anything about yourself yet. Choose Edit to add your background and skills."
        />
    {/if}
</div>
