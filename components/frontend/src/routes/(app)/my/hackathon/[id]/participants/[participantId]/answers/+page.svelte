<script lang="ts">
    import { resolve } from '$app/paths';
    import RegistrationForm from '$lib/components/hackathon/RegistrationForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // The profile's own title, named as that page names it. The load 404s for
    // anyone but the viewer, so the layout's membership is this participant.
    const profileLabel = $derived(
        data.myMembership?.user?.displayName || data.myMembership?.user?.username || 'Your Profile'
    );
</script>

<!--
  Same page shell as the profile above it, so moving between the two does not
  shift the column. Back, Cancel and a successful save all lead to the profile.
-->
<div class="flex w-full flex-col px-4 py-8 sm:px-10 md:px-20">
    <div class="flex w-full max-w-3xl flex-col gap-6">
        <PageHeader
            title="Your Registration Answers"
            back={{
                href: `/my/hackathon/${data.hackathonId}/participants/${data.participantId}`,
                label: profileLabel,
            }}
        >
            {#snippet meta()}Your answers for {data.name}. You can change them at any time.{/snippet}
        </PageHeader>

        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        {#if data.questions.length === 0}
            <section class="card flex flex-col gap-3 px-5 py-4">
                <p class="m-0 text-sm text-ink-3">This hackathon asks nothing at sign-up.</p>
            </section>
        {:else}
            <RegistrationForm questions={data.questions} values={data.values}>
                {#snippet actions()}
                    <button type="submit" class="btn btn-sm btn-solid">Save answers</button>
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/participants/${data.participantId}`)}
                        class="btn btn-sm btn-ghost no-underline"
                    >
                        Cancel
                    </a>
                {/snippet}
            </RegistrationForm>
        {/if}
    </div>
</div>
