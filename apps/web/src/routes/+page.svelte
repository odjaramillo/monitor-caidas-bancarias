<script lang="ts">
  import { MESSAGES } from '#lib/status.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // The shell is on screen before the API answers.
  // The subscription to the screen ($screen) asks for the status.
  let screen = $derived(data.screen);
</script>

<svelte:head>
  <title>Monitor de caídas bancarias</title>
</svelte:head>

<main>
  <h1>Monitor de caídas bancarias</h1>

  {#if $screen.state === 'ok'}
    {@const view = $screen.view}
    {#if view.all.length === 0}
      <p class="notice">{MESSAGES.empty}</p>
    {:else}
      {#each view.alerts as pair (pair.key)}
        <article class="card {pair.level}">
          <h2>{pair.levelLabel}</h2>
          <p>{pair.message}</p>
        </article>
      {/each}

      {#if view.normalCount > 0}
        <article class="card normal">
          <h2>Normal</h2>
          <p>{view.normalSummary}</p>
        </article>
      {/if}

      <details>
        <summary>Ver todos los pares</summary>
        <ul>
          {#each view.all as pair (pair.key)}
            <li class={pair.level}>
              <strong>{pair.route}</strong>
              <span class="level">{pair.levelLabel}</span>
              <span>{pair.message}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    <p class="updated">Actualizado a las {view.updatedAt}</p>
  {:else if $screen.state === 'loading'}
    <p class="notice" role="status">{MESSAGES.loading}</p>
  {:else}
    {#if $screen.state === 'error'}
      <p class="notice" role="alert">{MESSAGES.error}</p>
    {:else}
      <p class="notice" role="status">{MESSAGES.computing}</p>
    {/if}
    <button class="retry" type="button" onclick={() => screen.refresh()}>Reintentar</button>
  {/if}
</main>

<a class="report" href="/reportar">Reportar un problema</a>

<style>
  main {
    max-width: 32rem;
    margin: 0 auto;
    padding: 1rem 1rem 6rem;
  }

  h1 {
    font-size: 1.75rem;
    line-height: 1.2;
  }

  .card {
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid;
    border-radius: 0.5rem;
  }

  .card h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
  }

  .card p {
    margin: 0;
    line-height: 1.4;
  }

  .muchos_reportes {
    background: #fde8e7;
    border-color: #c22f2a;
  }

  .muchos_reportes h2,
  .muchos_reportes .level {
    color: #a3221d;
  }

  .posibles_problemas {
    background: #fdf5dc;
    border-color: #c9a227;
  }

  .posibles_problemas h2,
  .posibles_problemas .level {
    color: #7a5f06;
  }

  .normal {
    background: #e8f4e8;
    border-color: #4c9a52;
  }

  .normal h2,
  .normal .level {
    color: #107628;
  }

  summary {
    padding: 0.75rem 0;
    color: #0b4cc4;
    font-weight: bold;
    text-align: center;
    cursor: pointer;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The level is text in each row, so the colour is not the only signal. */
  li {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
  }

  .level {
    font-weight: bold;
  }

  .updated,
  .notice {
    color: #5f5f5f;
    text-align: center;
  }

  .retry {
    display: block;
    min-height: 2.75rem;
    margin: 0 auto;
    padding: 0.75rem 1.5rem;
    border: 1px solid #0b4cc4;
    border-radius: 0.5rem;
    background: #fff;
    color: #0b4cc4;
    font: inherit;
    font-weight: bold;
    cursor: pointer;
  }

  .retry:focus-visible {
    outline: 3px solid #0b4cc4;
    outline-offset: 2px;
  }

  .report {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    max-width: 30rem;
    margin: 0 auto;
    padding: 1rem;
    border-radius: 0.5rem;
    background: #0b4cc4;
    color: #fff;
    font-size: 1.125rem;
    font-weight: bold;
    text-align: center;
    text-decoration: none;
  }
</style>
