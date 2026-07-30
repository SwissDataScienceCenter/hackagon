<script lang="ts" module>
    export interface SelectOption {
        label: string;
        value: string;
    }
</script>

<script lang="ts">
    import { Combobox } from '@skeletonlabs/skeleton-svelte';

    let {
        name,
        options,
        placeholder = 'Select…',
        value = $bindable('')
    }: {
        name: string;
        options: SelectOption[];
        placeholder?: string;
        value?: string;
    } = $props();
</script>

<input type="hidden" {name} {value} />
<Combobox
    data={options}
    defaultValue={value ? [value] : []}
    onValueChange={(details) => (value = details.value[0] ?? '')}
    {placeholder}
    width="w-full"
    inputGroupBase="input-group grid-cols-[1fr_auto] rounded-none border border-surface-200-800 bg-surface-50-950"
    inputGroupInput="ig-input text-xs text-surface-950-50 focus:outline-none"
    inputGroupButton="ig-btn hover:preset-tonal rounded-none"
    contentBase="card p-2 overflow-y-auto rounded-none"
    contentBackground="preset-outlined-surface-200-800 bg-surface-50-950"
    optionBase="btn justify-start w-full rounded-none text-xs"
    optionHover="hover:preset-tonal"
    optionActive="preset-filled-primary-500"
/>
