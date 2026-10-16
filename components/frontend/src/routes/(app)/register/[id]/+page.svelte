<script lang="ts">
    import { resolve } from '$app/paths';
    import RegistrationForm from '$lib/components/hackathon/RegistrationForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!--
  Signing up, and answering from the waiting list. A confirmed member changes
  their answers inside the hackathon instead, on the answers page under their
  own profile, where the sidebar stays — this page is outside /my/hackathon/[id]/
  because the people it is for cannot pass that layout's check yet.
-->
<div class="flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-10">
    <div class="flex flex-col gap-1">
        <a
            href={resolve('/dashboard')}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to dashboard
        </a>
        <h1 class="m-0 text-title text-ink">
            {data.isMember ? 'Your registration' : `Register for ${data.name}`}
        </h1>
        <p class="m-0 text-xs text-ink-3">
            {#if data.isMember}
                Your answers for {data.name}. You can change them at any time.
            {:else}
                {data.name} asks a few questions before you join.
            {/if}
        </p>
    </div>

    {#if data.isWaiting}
        <p class="m-0 text-xs text-ink-3">
            You are on the waiting list. Your answers are what the organizers read
            when they review it, so you can still change them while you wait.
        </p>
    {/if}

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {:else if form?.saved}
        <p class="m-0 text-xs text-success-ink" role="status">Answers saved.</p>
    {/if}

    {#if data.questions.length === 0}
        <section class="card flex flex-col gap-3 px-5 py-4">
            <p class="m-0 text-sm text-ink-3">
                This hackathon asks nothing at sign-up.
            </p>
            {#if !data.isMember}
                <!-- Nothing to answer, so the form is the join. Posting the empty
                     form is exactly what the dashboard button would have done. -->
                <form method="POST">
                    <button type="submit" class="btn btn-sm btn-solid">
                        Join {data.name}
                    </button>
                </form>
            {/if}
        </section>
    {:else}
        <RegistrationForm questions={data.questions} values={data.values}>
            {#snippet actions()}
                <button type="submit" class="btn btn-sm btn-solid">
                    {data.isMember ? 'Save answers' : `Join ${data.name}`}
                </button>
                <a href={resolve('/dashboard')} class="btn btn-sm btn-ghost no-underline">
                    Cancel
                </a>
            {/snippet}
        </RegistrationForm>
    {/if}
</div>
