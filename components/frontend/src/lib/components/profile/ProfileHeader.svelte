<script lang="ts">
    import { globalRoleBadges, profileInitials } from '$lib/utils/profile';

    let {
        name,
        username,
        email,
        title,
        affiliation,
        linkedinUrl,
        joinedAt,
        roles = [],
        actions,
    }: {
        name: string;
        username: string;
        /** Keycloak-owned, so shown but never editable. Omitted when blank. */
        email?: string;
        /**
         * TODO(backend: user-profile-fields): `title`, `affiliation` and
         * `linkedinUrl` come from $lib/mocks/userProfiles — User carries none of
         * them. Each line is omitted when absent, which is also how the real
         * fields will behave while still blank.
         */
        title?: string;
        affiliation?: string;
        linkedinUrl?: string;
        joinedAt?: Date;
        /** GlobalRole numbers from casbin; unnamed values are dropped. */
        roles?: number[];
        /** Trailing controls — Edit on your own profile, nothing on someone else's. */
        actions?: import('svelte').Snippet;
    } = $props();

    const initials = $derived(profileInitials(name, username));
    const badges = $derived(globalRoleBadges(roles));
</script>

<!--
  Metrics follow ParticipantCard so a profile reads as the expanded form of the
  card you clicked to reach it: py-4 px-5 body, gap-4 row, text-sm font-bold
  title, text-xs body. The avatar is size-20 rather than size-16 — this is the
  page's subject, not one row in a list.
-->
<header
    class="box-border w-full border border-surface-200-800 bg-surface-100-900 px-5 py-4"
>
    <div class="flex w-full flex-col gap-4 sm:flex-row sm:items-start">
        <div
            class="flex size-20 shrink-0 items-center justify-center rounded-full border-2
                   border-surface-200-800 bg-surface-200-800 text-sm font-bold
                   text-surface-950-50"
            aria-hidden="true"
        >
            {initials}
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
                <h1 class="m-0 text-lg font-bold leading-snug text-surface-950-50">
                    {name}
                </h1>
                {#each badges as badge (badge.label)}
                    <span class="badge {badge.preset}">{badge.label}</span>
                {/each}
            </div>

            <p class="m-0 text-xs leading-snug text-surface-500">@{username}</p>

            {#if title}
                <p class="m-0 text-xs leading-snug text-surface-600-400">{title}</p>
            {/if}
            {#if affiliation}
                <p class="m-0 text-xs leading-snug text-surface-500">{affiliation}</p>
            {/if}

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                {#if email}
                    <a
                        href="mailto:{email}"
                        class="text-xs leading-snug text-primary-600-400 hover:underline"
                    >
                        {email}
                    </a>
                {/if}
                {#if linkedinUrl}
                    <!-- eslint-disable svelte/no-navigation-without-resolve -- external LinkedIn URL -->
                    <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-xs leading-snug text-primary-600-400 hover:underline"
                    >
                        LinkedIn Profile
                    </a>
                    <!-- eslint-enable svelte/no-navigation-without-resolve -->
                {/if}
                {#if joinedAt}
                    <span class="text-xs leading-snug text-surface-500">
                        Joined {joinedAt.toLocaleDateString()}
                    </span>
                {/if}
            </div>
        </div>

        {#if actions}
            <div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
        {/if}
    </div>
</header>
