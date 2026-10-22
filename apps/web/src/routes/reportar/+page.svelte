<script lang="ts">
  import { BANKS, FAILURE_TYPES, type BankId, type FailureType } from '#lib/banks.js';
  import { canSend, REPORT_MESSAGES, type Report } from '#lib/report.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let form = $derived(data.form);

  const banks = Object.entries(BANKS);
  const failures = Object.entries(FAILURE_TYPES);

  // The three answers. Empty until the person picks one.
  let origin = $state<BankId | ''>('');
  let destination = $state<BankId | ''>('');
  let type = $state<FailureType | ''>('');

  let sendable = $derived(canSend(origin, destination, type, $form.state));
</script>

<svelte:head>
  <title>Reportar un problema · Monitor de caídas bancarias</title>
</svelte:head>

<main>
  <a class="back" href="/">← Ver el estado</a>
  <h1>Reportar un problema</h1>

  {#if $form.state === 'sent'}
    <p class="thanks" role="status">{REPORT_MESSAGES.sent}</p>
    <a class="primary" href="/">Ver el estado</a>
    <button
      class="secondary"
      type="button"
      onclick={() => {
        origin = '';
        destination = '';
        type = '';
        form.reset();
      }}>Enviar otro reporte</button
    >
  {:else}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        form.submit({ origin, destination, type } as Report);
      }}
    >
      <div class="question">
        <label for="origin"><span class="step">1</span> ¿De qué banco sale el pago?</label>
        <select id="origin" bind:value={origin}>
          <option value="" disabled>Elige un banco</option>
          {#each banks as [id, name] (id)}
            <option value={id}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="question">
        <label for="destination"><span class="step">2</span> ¿A qué banco llega el pago?</label>
        <select id="destination" bind:value={destination}>
          <option value="" disabled>Elige un banco</option>
          {#each banks as [id, name] (id)}
            <option value={id}>{name}</option>
          {/each}
        </select>
      </div>

      <fieldset class="question">
        <legend><span class="step">3</span> ¿Qué pasó?</legend>
        {#each failures as [id, label] (id)}
          <label class="choice">
            <input type="radio" name="type" value={id} bind:group={type} />
            {label}
          </label>
        {/each}
      </fieldset>

      {#if $form.state === 'error'}
        <p class="error" role="alert">{$form.message}</p>
      {/if}

      <button class="primary send" type="submit" disabled={!sendable}>
        {$form.state === 'sending' ? 'Enviando…' : 'Enviar reporte'}
      </button>
    </form>
  {/if}
</main>

<style>
  main {
    max-width: 32rem;
    margin: 0 auto;
    padding: 1rem 1rem 7rem;
  }

  .back {
    color: #0b4cc4;
    font-weight: bold;
    text-decoration: none;
  }

  h1 {
    font-size: 1.75rem;
    line-height: 1.2;
  }

  .question {
    margin: 0 0 1.25rem;
    padding: 1rem;
    border: 1px solid #d6d6d6;
    border-radius: 0.5rem;
  }

  label,
  legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: bold;
  }

  legend {
    padding: 0 0.25rem;
  }

  .step {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: #5f5f5f;
    color: #fff;
    font-size: 0.9rem;
  }

  /* Big targets for one thumb: at least 48 px high. */
  select {
    width: 100%;
    min-height: 3rem;
    margin-top: 0.75rem;
    padding: 0 0.75rem;
    border: 1px solid #8a8a8a;
    border-radius: 0.5rem;
    background: #fff;
    color: inherit;
    font: inherit;
    font-size: 1.125rem;
  }

  .choice {
    justify-content: center;
    min-height: 3rem;
    margin-top: 0.75rem;
    padding: 0 0.75rem;
    border: 1px solid #8a8a8a;
    border-radius: 0.5rem;
    font-weight: normal;
    font-size: 1.125rem;
    cursor: pointer;
  }

  /* The radio is hidden, but stays in the page for the keyboard and screen readers. */
  .choice input {
    position: absolute;
    opacity: 0;
  }

  .choice:has(input:checked) {
    border: 2px solid #0b4cc4;
    background: #e7eefb;
    color: #0b4cc4;
    font-weight: bold;
  }

  .choice:has(input:focus-visible) {
    outline: 3px solid #0b4cc4;
    outline-offset: 2px;
  }

  .error {
    color: #a3221d;
    font-weight: bold;
    text-align: center;
  }

  .thanks {
    padding: 1rem;
    border: 1px solid #4c9a52;
    border-radius: 0.5rem;
    background: #e8f4e8;
    color: #107628;
    font-size: 1.25rem;
    font-weight: bold;
    text-align: center;
  }

  .primary,
  .secondary {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 3rem;
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid #0b4cc4;
    border-radius: 0.5rem;
    font: inherit;
    font-size: 1.125rem;
    font-weight: bold;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .primary {
    background: #0b4cc4;
    color: #fff;
  }

  .secondary {
    background: #fff;
    color: #0b4cc4;
  }

  /* The send button stays at the bottom, where the thumb reaches. */
  .send {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    width: auto;
    max-width: 30rem;
    margin: 0 auto;
  }

  .send:disabled {
    border-color: #b8b8b8;
    background: #d6d6d6;
    color: #5f5f5f;
    cursor: not-allowed;
  }
</style>
