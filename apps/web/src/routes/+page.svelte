<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Monitor de caídas bancarias</title>
</svelte:head>

<main>
  <h1>Monitor de caídas bancarias</h1>

  {#if data.state === 'ok'}
    {#each data.view.alerts as pair (pair.key)}
      <article class="card {pair.level}">
        <h2>{pair.levelLabel}</h2>
        <p>{pair.message}</p>
      </article>
    {/each}

    {#if data.view.normalCount > 0}
      <article class="card normal">
        <h2>Normal</h2>
        <p>{data.view.normalSummary}</p>
      </article>
    {/if}

    <details>
      <summary>Ver todos los pares</summary>
      <ul>
        {#each data.view.all as pair (pair.key)}
          <li class={pair.level}>
            <strong>{pair.route}</strong>
            <span>{pair.message}</span>
          </li>
        {/each}
      </ul>
    </details>

    <p class="updated">Actualizado a las {data.view.updatedAt}</p>
  {:else}
    <p class="notice" role="status">{data.message}</p>
  {/if}
</main>

<a class="report" href="/reportar">Reportar un problema</a>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    color: #1b1b1b;
    background: #fff;
  }

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

  .muchos_reportes h2 {
    color: #a3221d;
  }

  .posibles_problemas {
    background: #fdf5dc;
    border-color: #c9a227;
  }

  .posibles_problemas h2 {
    color: #7a5f06;
  }

  .normal {
    background: #e8f4e8;
    border-color: #4c9a52;
  }

  .normal h2 {
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

  li {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
    padding: 0.75rem;
    border-left: 4px solid;
  }

  .updated,
  .notice {
    color: #5f5f5f;
    text-align: center;
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
