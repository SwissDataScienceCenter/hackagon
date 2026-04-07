<script lang="ts">
	import { page } from '$app/state';
	import { AlertTriangle } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	// Extract error details safely using optional chaining
	const status = page.status;
	const message = page.error?.message;
</script>

<div class="flex flex-col items-center justify-center min-h-screen">
	<div
		class="w-full max-w-lg p-8 space-y-4 text-center rounded-lg shadow-xl card variant-ghost-surface"
	>
		<header class="flex flex-col items-center space-y-4">
			<AlertTriangle class="text-error-300" size={64} stroke-width={1.5} />
			<h1 class="text-4xl font-bold h1">{status}</h1>
		</header>

		<div class="space-y-2">
			<p class="text-surface-700 text-medium">
				{message || 'An unexpected error occurred.'}
			</p>
		</div>

		<hr class="border-primary-950-50 !my-6" />

		<footer class="flex flex-col items-center">
			<a href={resolve('/')} class="btn preset-outlined-primary-500">
				<span>Go back to Homepage</span>
			</a>
		</footer>
	</div>
</div>
