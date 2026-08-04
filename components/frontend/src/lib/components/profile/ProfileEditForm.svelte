<script lang="ts">
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import {
        AFFILIATION_MAX_LENGTH,
        DESCRIPTION_MAX_LENGTH,
        URL_MAX_LENGTH,
        validateProfileDraft,
        type ProfileDraft,
    } from '$lib/utils/profile';

    let {
        affiliation = '',
        title = '',
        description = '',
        linkedinUrl = '',
        onsave,
        oncancel,
    }: {
        affiliation?: string;
        title?: string;
        description?: string;
        linkedinUrl?: string;
        onsave: (draft: ProfileDraft) => void;
        oncancel: () => void;
    } = $props();

    let errors = $state<Partial<Record<keyof ProfileDraft, string>>>({});

    // A plain form read through FormData rather than three bound variables:
    // MarkdownEditor keeps its text internal and exposes it only as a named
    // field, and this is the shape a SvelteKit action wants anyway. When
    // UserService.Edit lands, this becomes method="POST" + use:enhance and the
    // markup below does not change.
    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();

        const form = new FormData(event.currentTarget as HTMLFormElement);
        const draft: ProfileDraft = {
            affiliation: String(form.get('affiliation') ?? '').trim(),
            title: String(form.get('title') ?? '').trim(),
            description: String(form.get('description') ?? '').trim(),
            linkedinUrl: String(form.get('linkedinUrl') ?? '').trim(),
        };

        const found = validateProfileDraft(draft);
        errors = found;
        if (Object.keys(found).length > 0) return;

        onsave(draft);
    }

    const inputClass =
        'h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950 px-3 ' +
        'text-xs text-surface-950-50 placeholder:text-surface-700-300 ' +
        'focus:border-primary-500 focus:outline-none';
    const labelClass = 'text-xs font-semibold text-surface-950-50';
    const errorClass = 'm-0 text-[10px] text-error-600-400';
</script>

<form
    onsubmit={handleSubmit}
    class="box-border flex w-full flex-col gap-4 border border-surface-200-800
           bg-surface-100-900 px-5 py-4"
>
    <h2 class="m-0 text-sm font-bold leading-snug text-surface-950-50">Edit profile</h2>

    <!-- Name and email are deliberately absent, not merely disabled: WhoAmI
         rewrites display_name and email from the Keycloak JWT on every request
         (user_service.go), so an edit here would revert on the next page load.
         They change in Keycloak's own account console. -->
    <p class="m-0 text-[10px] leading-snug text-surface-500">
        Your name and email come from your login account and can't be changed here.
    </p>

    <div class="flex flex-col gap-1.5">
        <label class={labelClass} for="profile-title">Title</label>
        <input
            id="profile-title"
            name="title"
            type="text"
            value={title}
            maxlength={AFFILIATION_MAX_LENGTH}
            placeholder="e.g. Research Engineer"
            class={inputClass}
            aria-invalid={errors.title ? 'true' : undefined}
        />
        {#if errors.title}<p class={errorClass}>{errors.title}</p>{/if}
    </div>

    <div class="flex flex-col gap-1.5">
        <label class={labelClass} for="profile-affiliation">Affiliation</label>
        <input
            id="profile-affiliation"
            name="affiliation"
            type="text"
            value={affiliation}
            maxlength={AFFILIATION_MAX_LENGTH}
            placeholder="e.g. ETH Zürich · Institute for Machine Learning"
            class={inputClass}
            aria-invalid={errors.affiliation ? 'true' : undefined}
        />
        {#if errors.affiliation}<p class={errorClass}>{errors.affiliation}</p>{/if}
    </div>

    <div class="flex flex-col gap-1.5">
        <label class={labelClass} for="profile-linkedin">LinkedIn</label>
        <input
            id="profile-linkedin"
            name="linkedinUrl"
            type="url"
            value={linkedinUrl}
            maxlength={URL_MAX_LENGTH}
            placeholder="https://www.linkedin.com/in/…"
            class={inputClass}
            aria-invalid={errors.linkedinUrl ? 'true' : undefined}
        />
        {#if errors.linkedinUrl}<p class={errorClass}>{errors.linkedinUrl}</p>{/if}
    </div>

    <div class="flex flex-col gap-1.5">
        <label class={labelClass} for="profile-description">About you</label>
        <p class="m-0 text-[10px] leading-snug text-surface-500">
            Your background and the skills you bring to a team. Others read this when
            forming teams.
        </p>
        <MarkdownEditor
            id="profile-description"
            name="description"
            value={description}
            rows={10}
            maxlength={DESCRIPTION_MAX_LENGTH}
            placeholder="What you work on, and the skills you'd bring to a team…"
        />
        {#if errors.description}<p class={errorClass}>{errors.description}</p>{/if}
    </div>

    <div class="flex items-center gap-2">
        <button type="submit" class="btn btn-sm preset-filled-primary-500">
            Save changes
        </button>
        <button
            type="button"
            onclick={oncancel}
            class="btn btn-sm preset-tonal-surface"
        >
            Cancel
        </button>
    </div>
</form>
