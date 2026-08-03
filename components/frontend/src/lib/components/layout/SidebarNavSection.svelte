<script lang="ts">
    import type { ComponentType } from 'svelte';
    import Lock from 'lucide-svelte/icons/lock';
    import Check from 'lucide-svelte/icons/check';
    import type { NavItem } from '$lib/navigation';
    import { lockReason } from '$lib/utils/capabilities';

    let {
        label,
        items,
        collapsed,
        activeId,
        activeColor = 'primary',
        markerIcon,
        titlePrefix,
        gateStyle = 'blocking',
    }: {
        /** Omit where a heading would just repeat nearby context. */
        label?: string;
        items: NavItem[];
        collapsed: boolean;
        /** Computed once across all sections by the caller, so two sections can
         *  never both render as active. */
        activeId?: string;
        activeColor?: 'primary' | 'secondary' | 'tertiary';
        /** Stands in for the hidden heading on the collapsed rail. Pass one where
         *  the section's icons repeat another section's — the divider alone says
         *  "a new section", not which one. */
        markerIcon?: ComponentType;
        /** Disambiguates collapsed tooltips, e.g. "Manage · Participants". With
         *  no visible label the tooltip is also the link's accessible name, so
         *  three sections owning a Users icon otherwise read identically. */
        titlePrefix?: string;
        /** What a shut capability means for *this* viewer.
         *
         *  `blocking` — they cannot act. The row dims, and a `coming` one stops
         *  being a link entirely; see the each-block below for why `closed` does
         *  not.
         *  `advisory` — the capability is shut for participants but the viewer
         *  is not, which is every organizer: `requireCapability` waves through
         *  anyone who can write the hackathon. Dimming or disabling those rows
         *  would claim a lockout the backend does not enforce. */
        gateStyle?: 'blocking' | 'advisory';
    } = $props();

    const ACTIVE_CLASS = {
        primary: 'bg-surface-100-900 font-medium text-primary-700-300',
        secondary: 'bg-surface-100-900 font-medium text-secondary-700-300',
        tertiary: 'bg-surface-100-900 font-medium text-tertiary-700-300',
    };

    const LABEL_CLASS = {
        primary: 'text-surface-500',
        secondary: 'text-secondary-500',
        tertiary: 'text-tertiary-500',
    };

    // Undefined for an open capability, so this doubles as "is there anything to
    // say". An ungoverned one never reaches here — memberNav/manageNav omit the
    // gate outright.
    function reasonFor(item: NavItem): string | undefined {
        return item.gate && lockReason(item.gate.capability, item.gate);
    }

    // The section prefix is rail-only: expanded, the heading above already says
    // which section this is, and repeating it in every tooltip is noise. The
    // reason shows in both — it is the only place the date lives, since the nav
    // deliberately states availability and leaves deadlines to the header chip.
    function tooltip(item: NavItem): string | undefined {
        const reason = reasonFor(item);
        if (!collapsed) return reason;

        const name = titlePrefix ? `${titlePrefix} · ${item.label}` : item.label;

        return reason ? `${name} — ${reason}` : name;
    }
</script>

<div class="flex flex-col gap-0.5 border-t border-surface-200-800 p-2">
    {#if label && !collapsed}
        <span class="px-2 pb-1 text-xs font-bold tracking-widest {LABEL_CLASS[activeColor]}">
            {label}
        </span>
    {:else if collapsed && markerIcon}
        {@const Marker = markerIcon}
        <!-- aria-hidden: the tooltips below already carry the section into each
             link's accessible name, so this would only repeat it. -->
        <span
            title={label}
            aria-hidden="true"
            class="flex h-6 items-center justify-center {LABEL_CLASS[activeColor]}"
        >
            <Marker class="h-3.5 w-3.5 shrink-0" />
        </span>
    {/if}
    {#each items as item (item.id)}
        {@const Icon = item.icon}
        {@const isActive = item.id === activeId}
        {@const reason = reasonFor(item)}
        <!-- Only what has not happened yet stops being a link. A phase that is
             over still has something to show — the proposals that were made, the
             projects that were submitted — and a member reviewing a finished
             hackathon must not be locked out of its own record. `coming` has no
             such record: the page would be empty and the lock is the whole
             answer.

             `blocking` only. An organizer is never held out by a capability, so
             their locks are advisory and every manage row stays clickable. -->
        {@const notYet = gateStyle === 'blocking' && item.gate?.state === 'coming'}
        {#if item.href && !notYet}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- these hrefs are
                 built with resolve() in $lib/navigation; the rule only recognizes a
                 literal resolve() call in the attribute itself. -->
            <a
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                title={tooltip(item)}
                class="flex h-10 items-center gap-2 rounded-lg px-2 text-sm no-underline
                       transition-colors
                       {isActive ? ACTIVE_CLASS[activeColor] : 'text-surface-500 hover:text-surface-700-300'}
                       {collapsed ? 'justify-center' : ''}
                       {reason && gateStyle === 'blocking' ? 'opacity-60' : ''}"
            >
                <Icon class="h-4 w-4 shrink-0" />
                {#if !collapsed}
                    <span class="truncate">{item.label}</span>
                    <!-- A lock is the wrong word for something that already
                         happened: nothing is being withheld, the window simply
                         closed. A check says "done, and still here to read",
                         which is what a clickable past row is.

                         No date either way — the header chip owns the one
                         deadline that matters, and repeating it on every row
                         makes four dates compete. The tooltip has it. -->
                    {#if reason}
                        {@const GateIcon = item.gate?.state === 'coming' ? Lock : Check}
                        <GateIcon class="ml-auto h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                    {/if}
                {/if}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {:else}
            <span
                aria-disabled="true"
                title={notYet ? tooltip(item) : 'Not available yet'}
                class="flex h-10 cursor-not-allowed items-center gap-2 rounded-lg px-2 text-sm
                       text-surface-500 opacity-50 {collapsed ? 'justify-center' : ''}"
            >
                <Icon class="h-4 w-4 shrink-0" />
                <!-- The reason is the whole point of the row, and a non-focusable
                     span keeps it out of the tab order — so it goes in the
                     accessible name rather than the tooltip alone. -->
                {#if notYet}
                    <span class="sr-only">{reason}</span>
                {/if}
                {#if !collapsed}
                    <span class="truncate">{item.label}</span>
                    {#if notYet}
                        <Lock class="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
                    {/if}
                {/if}
            </span>
        {/if}
    {/each}
</div>
