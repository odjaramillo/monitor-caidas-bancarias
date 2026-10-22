<script lang="ts">
  import favicon from '#lib/assets/favicon.svg';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
  /* Shared by every screen, so a visitor who opens /reportar directly gets them too. */
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    color: #1b1b1b;
    background: #fff;
  }
</style>
