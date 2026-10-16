<script lang="ts">
    import { resolve } from '$app/paths';
    import RegistrationForm from '$lib/components/hackathon/RegistrationForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!--
  Same page shell as the profile above it, so moving between the two does not
  shift the column. Back, Cancel and a successful save all lead to the profile.
-->
<div class="flex w-full flex-col px-4 py-8 sm:px-10 md:px-20">
    <div class="flex w-full max-w-3xl flex-col gap-6">
        <div class="flex flex-col gap-1">
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/participants/${data.participantId}`)}
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                &larr; Back to your profile
            </a>
            <h2 class="m-0 text-title text-ink">Your registration answers</h2>
            <p class="m-0 text-xs text-ink-3">
                Your answers for {data.name}. You can change them at any time.
            </p>
        </div>

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
